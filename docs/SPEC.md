# ChatRPG 仕様書

## 1. コンセプト

KoboldCpp（LLM推論＋内蔵Stable Diffusion）を用い、完全ローカル環境で動作する「複数キャラクターとのチャット＋動的画像生成」Webアプリ。

- ユーザーは「部屋」の中で複数の女性キャラクターと会話する。親密な会話や恋愛関係の進行（イチャコラ）を楽しむことを主目的とし、性的表現を含む会話・シーン描写にも対応する
- 完全ローカル・個人利用のプライベート環境であるため、成人向け表現の生成そのものをアプリ側で制限・検閲する仕組みは設けない。登場キャラクターは成人という前提で運用する（Characterの年齢フィールドで管理）
- 会話の状況変化やイベント発生に応じて、キャラクターの画像（シーン・表情）が動的に生成・表示される
- PCで全処理を実行し、同一LAN内のスマートフォンからも画面サイズに応じたレイアウトでアクセスできる
- 外部クラウドAPIには一切依存しない、プライベートな個人利用アプリ

---

## 2. 要件定義

### 2.1 機能要件

- **部屋（Room）ベースの複数キャラチャット**
  複数キャラクターが同一の部屋に同席し、会話に参加できる。認証は不要（LAN内利用前提）。
- **キャラクター管理**
  キャラクターの人格・口調・外見・衣装・表情差分画像を登録・編集できる。
- **動的画像生成**
  - シーン転換検知時：場所・状況が変化したタイミングで背景画像を生成
  - イベント発火時：条件を満たしたイベントに応じた専用画像を生成
  - 通常会話中は事前生成済みの表情差分画像を即時表示（生成待ちなし）
- **イベントシステム（汎用ルールエンジン）**
  ユーザーが「条件」と「発火内容（アクション）」を自由に組み合わせて定義できる。ハードコードされた固定イベント種別ではなく、条件式とアクションの組み合わせによる汎用設計とする。
- **部屋テンプレート／セッション分離**
  部屋の設定（世界観・場所・雰囲気・初期シチュエーション等）はテンプレートとして再利用可能。プレイのたびに新しいセッションとして初期状態からスタートできる。
- **レスポンシブUI**
  PC・スマートフォンの両方で閲覧・操作可能。画面サイズに応じてレイアウトを可変にする。

### 2.2 非機能要件

- 完全ローカル完結（外部通信なし）
- 想定GPU VRAM：12〜16GB（LLMは13B級、画像生成はSDXL系モデルを目安とする。具体モデルは未選定）
- 画像生成はキューイングし、同時実行を回避（GPU負荷対策）
- チャット応答はストリーミング表示
- 画像生成中もチャット操作をブロックしない非同期設計

### 2.3 技術スタック

| 項目 | 選定 |
|---|---|
| フロントエンド | React（Vite） |
| バックエンド | Node.js + Express |
| AIバックエンド | KoboldCpp（テキスト生成API／内蔵SD画像生成API） |
| リアルタイム通信 | WebSocket または SSE（ストリーミング応答・画像生成完了通知） |
| ストレージ | SQLite＋ローカル画像フォルダ |

### 2.4 未確定事項（今後の検討事項）

- KoboldCppで使用する具体的なLLM／SDモデルの選定（成人向け表現・ロールプレイに対応した無検閲系モデルを想定）
- 会話履歴がコンテキスト長を超えた場合の要約圧縮方式（当面は直近N件カットで開始）
- イベント定義エディタのUI詳細
- 部屋・雰囲気の画像生成用タグを部屋ごとに個別管理する現方針の妥当性（共通ライブラリ化する可能性）

---

## 3. 機能仕様

### 3.1 世界（World）

複数の部屋（RoomTemplate）を束ねる上位階層。部屋は必ずいずれか1つのWorldに所属する。

**World**
- 名前
- 基本世界観（自由記述。所属する部屋がこの世界観を継承する場合に使われる共通テキスト）
- `is_unassigned_bucket`：予約フラグ。「未所属」World専用で、削除不可・常に1件だけ存在する（Worldを選ばずに部屋を作った場合の受け皿）
- **カレンダー設定**（このWorldに属する全てのルート＝Playthroughが共通で使うルール。値そのものはルートごとに独立して進行する）
  - 時間帯ラベル一覧（順序付き。例：`["朝","昼","放課後","夜"]`。最後まで進むと次の日の先頭に戻る）
  - 天候候補一覧（例：`["晴れ","曇り","雨","雪"]`。日が変わるたびにこの中からランダム抽選）
  - 季節ラベル一覧（順序付き。例：`["春","夏","秋","冬"]`。最後まで進むと最初の季節に戻る）
  - 季節が切り替わる日数間隔（例：15日ごとに季節が1つ進む）
- **主人公（あなた）の既定設定**：このWorldに属する全ルートの既定値。ルート単位で上書きできる（3.2.1参照）
  - `protagonist_mode`：`character`（ユーザーは物語内に存在する一人物としてキャラクター参加する）／`narrator`（ユーザーは登場人物ではなく、場面全体を管理する神・ナレーター的視点。3.2.1参照）
  - `character`モード時の項目：名前／あだ名（NPCからの主な呼ばれ方。未指定時は「あなた」として扱う）／性別／職業・世界観内での立場／容貌・外見的特徴／その他情報（自由記述）
  - 性格・話し方・行動は意図的に項目化しない。主人公はプレイヤー自身が演じる存在であり、その人格をLLMに規定させないため

**部屋側の世界観モード（RoomTemplateに付与）**
- `worldview_mode`：`inherit`（所属Worldの基本世界観をそのまま継承）／`custom`（部屋固有の世界観を独自に設定し、所属Worldの世界観は使わない）
- 所属World自体はナビゲーション上の階層（世界一覧→部屋一覧）としては`custom`時も維持される。世界観モードが変わるのはLLMに渡すコンテキストの中身だけ

**画面導線**
- 世界観管理画面：World一覧の閲覧・新規作成・編集・削除（「未所属」は削除不可）
- 部屋一覧画面：World単位でグルーピングしてカード形式で部屋を表示。各カードは背景イメージのサマリー画像＋名前＋セッション件数を表示し、カードに「編集」ボタンを設けて対象の部屋作成・設定画面へ遷移する。「新規部屋」ボタンは空の部屋作成・設定画面へそのまま遷移する
- 部屋作成・設定画面：所属Worldの選択（未指定時は自動的に「未所属」）と、世界観モード（継承／独自）の切り替え。継承時は選択中Worldの基本世界観をプレビュー表示、独自時は部屋固有の世界観入力欄が有効化される

### 3.2 ルート（Playthrough）

Worldの下位に位置し、部屋をまたいで状態を共有する単位。同じWorld内に複数のルートを並行して持てる（例：「純愛ルート」「ハーレムルート」を同じ世界観のまま別々に進行させる）。

**Playthrough**
- 名前（例：「純愛ルート」）
- 所属World
- カレンダー状態：現在の日数、現在の時間帯（所属Worldの時間帯ラベル一覧中のインデックス）、現在の天候、現在の季節（所属Worldの季節ラベル一覧中のインデックス）
- ステータス：`active`（進行中）／`ended`（明示的に終了）
- このルートに紐づく関係性パラメータ（好感度等）・イベントフラグ・イベント発火履歴は、ルート内でどの部屋を訪れても共通で保持・更新される（3.5/3.6参照）

#### 3.2.1 主人公（あなた）の設定

Worldの既定設定（3.1）をそのまま継承するか、ルートごとに独自の主人公設定で上書きするかを選べる。

- `use_custom_protagonist`：false（既定・Worldの設定を継承）／true（このルート専用の設定を使う）
- true時は`protagonist_mode`および`character`モードの各項目（名前／あだ名／性別／職業／容貌／その他情報）をルート単位で個別に保持する

**`protagonist_mode`の2種類**
- `character`：ユーザーは物語内の一人物として存在する。LLMのシステムプロンプトには、設定済みの項目（空欄の項目は省略。全項目空なら何も注入しない）に加えて「主人公の性格・話し方・行動はプレイヤー自身の発言に委ね、この設定情報を根拠に生成しないこと」という指示を付与する
- `narrator`：ユーザーは登場人物ではなく、場面全体を管理する神・ナレーター的視点（主人公機能追加前の挙動に相当）。この場合`character`モードの各項目は使用せず、代わりに「ユーザーの発言は特定キャラクターの言動ではなく場面・NPCの言動への直接指示として扱い、可能な限りそのまま反映する」という指示をシステムプロンプトに注入する

**主人公なりすまし対策**

小規模なローカルLLMは否定的な指示だけでは確実に守らないことがある（実機検証で、主人公の名前を教えた結果、モデルが`[名前]: セリフ`という形式で主人公自身の発言を生成してしまう事例を確認）。そのため`character`モードでは、システムプロンプトでの明示的な禁止指示に加えて、LLM出力をパースした後のコード側でも主人公の名前・あだ名に一致するキャラクター発言ターンを検出し、表示前に破棄する（プロンプトでの指示だけに頼らない二重の安全策）。

**時間経過（カレンダー進行）**

時間帯を1つ進める処理は、以下いずれのタイミングでも発生しうる（すべて同じ処理を呼び出す）。
- 会話ターン数トリガー：RoomTemplateごとに設定する`turns_per_time_slot`（後述）のターン数に達した時点で自動的に進める。未設定の部屋ではこのトリガーは働かない
- 部屋を退出する操作：ユーザーが部屋から退出する（RoomSessionを終了する）タイミングで進める
- イベントアクション`advance_time`：既存の条件システムと組み合わせ、任意の条件を満たした際に強制的に進める（3.6.4参照）

「時間帯を1つ進める」処理の内容：
1. 現在の時間帯インデックスを+1（Worldの時間帯ラベル数を超えたら0に戻し、日数を+1）
2. 日をまたいだ場合：Worldの天候候補一覧からランダムに天候を再抽選
3. 日をまたいだ場合：日数がWorldの季節切り替え日数間隔を超えるたびに季節を1つ進める（末尾まで進んだら最初の季節に戻る）

**ルート一覧・切り替えの画面導線**
- World詳細画面から、そのWorldに属する既存ルート一覧（名前・現在の日数/時間帯/天候・最終更新日時）を表示し、「続きから」で選択したルートを再開、または「新しいルートを始める」で新規ルートを作成する
- ルートを開くと、現在アクティブなRoomSession（まだ退出していない部屋）があればそのままチャット画面へ、なければ「どの部屋に入るか」を選ぶ画面を表示する（3.3の部屋を開く際のフロー参照）

### 3.3 部屋（Room）

**RoomTemplate（雛形・再利用可能）**
- 名前
- 所属World（`world_id`、必須。未指定時は「未所属」World）
- 世界観モード（`inherit` / `custom`）
- 開始時のシチュエーション（導入ナラティブ。セッション開始時のLLM初期プロンプトに使用）
- 場所（自由記述＋任意で画像生成用タグ）
- 雰囲気（自由記述＋任意で画像生成用タグ）
- 部屋固有の世界観（自由記述。世界観モードが`custom`の場合のみ使用）
- 設備・機材：Propライブラリから複数選択＋ライブラリ外の自由記述追加（自由記述分は画像生成プロンプトに含めない）
- 背景イメージ（固定。「アップロード」と「AIで生成」の2導線を用意する。生成時は場所・雰囲気タグ＋Propタグから3.7のプロンプト合成ロジックに準じて画像生成APIを呼び出す。セッション開始直後、まだシーン転換が起きていない間のデフォルト背景として使用し、動的生成の参照画像としては使わない）
- **`turns_per_time_slot`**（任意）：この部屋に滞在中、何ターンの会話が進んだら自動的にルートの時間帯を1つ進めるか。長時間の会話が続きやすい部屋とテンポの速い部屋とで個別にチューニングできるようにするため、部屋ごとの設定とする（未設定の場合はこのトリガーを使わず、退出操作／イベントによる時間経過のみに頼る）
- 初期参加キャラクター一覧
- 有効化するイベント定義一覧、部屋固有のイベント発生確率など

**部屋作成フロー**

手動フォーム入力に加え、キャラクター作成と同様のLLM自動生成導線を用意する。

- 「方針」欄（自由記述）にどんな部屋にしたいかのヒント（例：「現代学園、放課後の静かな教室、恋愛イベント向け」）を入力し、「この方針でランダム生成」を実行すると、KoboldCppが開始時のシチュエーション・場所・雰囲気（＋世界観モードがcustomの場合は世界観）・画像生成用タグの一次案を生成する
- 生成結果はフォームに反映されるのみで、確認・修正してからでないと保存されない（キャラクター作成のLLM自動生成と同じ、即確定しない方針）
- 背景イメージ自体は自動生成対象に含めず、上記の「AIで生成」ボタンから改めて実行する（タグ生成→画像生成を1アクションにまとめない。タグ内容をユーザーが確認できるようにするため）

**RoomSession（部屋への1回の訪問インスタンス）**
- 参照元テンプレートID、所属Playthrough（ルート）ID
- この訪問が発生した時点でのルートの日数・時間帯（作成時に固定。例：「1日目 放課後」。会話ログの表示や発言時刻はこのラベルに準じる）
- 開始日時、最終更新日時
- 現在の参加キャラクター一覧（イベントにより初期値から変動）
- 現在のシーン状態（会話中に場所・雰囲気が変化した場合、テンプレート初期値から分岐して保持）と直近のシーン画像
- 会話履歴
- ステータス：`active`（この部屋に滞在中）／`ended`（退出済み。退出時にルートの時間経過処理が実行される）
- 関係性パラメータ・イベントフラグ・イベント発火履歴はこのRoomSessionではなく所属Playthrough側で一元管理する（3.2参照。部屋を移動しても引き継がれる）
- 1つのRoomTemplateは複数のルート・複数回の訪問から繰り返し利用される（同じ部屋に別の日・別のルートから何度でも入れる）

**部屋を開く際のフロー（改訂）**
1. World→ルートを選択（または新規作成、3.2参照）
2. そのルートに現在アクティブなRoomSession（未退出）があれば、そのまま再開してチャット画面へ
3. なければ、そのWorldに属する部屋（RoomTemplate）一覧から入る部屋を選択し、新規RoomSessionを作成する（作成時点のルートの日数・時間帯をこのセッションに記録）
4. チャット画面で「部屋を退出する」操作を行うとRoomSessionが`ended`になり、ルートの時間経過処理（3.2）を実行したうえで、再度「どの部屋に入るか」の選択画面（手順3）に戻る

### 3.4 Propライブラリ

- 設備・機材の共通マスターデータ（名前＋danbooruタグ）
- 複数の部屋テンプレートから使い回し可能

### 3.5 キャラクター

**Character本体（衣装に依存しない情報）**

以下のフォーマットでLLMに注入する（ユーザー指定フォーマット）：

```
キャラ情報：{名前}/本名：{本名}/あだ名：{あだ名}/職業：{職業}/年齢：{年齢}歳/種族：{種族}/属性：{属性}/容姿特徴：{容姿特徴}/目色形状：{目色形状}/髪型髪色：{髪型髪色}/体型：{体型}/胸大きさ形：{胸}/身体特徴：{身体特徴}/一人称自分呼方『{一人称}』/あなたを『{呼称}』と呼ぶ/他人を『{他人呼称}』と呼ぶ/性格：{性格}/口調：{口調}/語尾：{語尾}/行動原理：{行動原理}/対人傾向：{対人傾向}/癖口癖：{癖}/好物：{好物}/苦手：{苦手}/服装：{現在Outfitの服装}/装備：{現在Outfitの装備}/スキル技能：{スキル}/特殊スキル：{特殊スキル}/弱点：{弱点}/秘密：{秘密}/備考：{備考}
```

保持フィールド：名前（愛称）／本名（フルネーム＋読み）／あだ名／職業／年齢（実年齢・外見年齢）／種族／属性／容姿特徴／目色形状／髪型髪色／体型／胸大きさ形／身体特徴／一人称／あなたの呼び方／他人の呼び方／性格／口調／語尾／行動原理／対人傾向／癖口癖／好物／苦手／スキル技能／特殊スキル／弱点／秘密／備考／イベント参加重み

「秘密」フィールドはLLMに渡すが、「関係性・状況に応じて慎重に扱い、安易に暴露しない」という指示を添えて注入する。

**Outfit（衣装バリエーション、Characterに紐づく）**
- 名前（制服／私服／水着など）
- 服装（テキスト、キャラ情報フォーマットの「服装」に対応）
- 装備（テキスト、「装備」に対応）
- 画像生成用danbooruタグ（手動入力が基本だが、後述のキャラ作成フローではLLMが一次案を提案し、ユーザーが確認・修正して確定する。自然文の容姿情報とは独立管理）
- 立ち絵イメージ（衣装につき1枚の全身画像。表情バリエーションは持たない固定画像）
- 表情差分画像セット（ExpressionTypeごとに1枚、顔まわりの差分表示用）
- デフォルト衣装フラグ

衣装切り替えは「部屋テンプレートのデフォルト指定」または「イベントアクション」から発生する。

**ExpressionType（表情マスター・全キャラ共通）**
- 通常／笑顔／怒り／悲しみ／驚き／照れ／困り／喘ぎ　等
- ハードコードせず、設定画面から追加・編集・削除できるユーザー管理のマスターデータとする
- LLM出力の`[EMOTION:xxx]`タグと対応するキー

**RelationshipAxis（関係性軸マスター・全キャラ共通）**
- 初期セット：好感度／信頼度／恋愛度（恋愛感情）／欲情度（興奮度）／依存度（メンヘラ・共依存的な執着傾向）／淫乱度（他パラメータの状態に関わらず身体的関係に積極的になりやすい度合い）
- ハードコードせず、ExpressionTypeと同様に設定画面から自由に追加・編集・削除できるユーザー管理のマスターデータとする
- 軸の定義自体は全キャラ共通、初期値のみキャラごとに設定可能（例：淫乱度は個性を表現するため、キャラごとに初期値を大きく変える想定）

**キャラクター作成フロー**

通常の手動フォーム入力に加え、以下2つの導線を用意する。どちらも最終的にCharacter本体の各フィールド（キャラ情報フォーマットの各項目）とOutfitのdanbooruタグ一次案を埋めた状態で編集フォームに反映し、ユーザーが確認・修正してから保存する（自動生成・貼り付けの結果を即確定はしない）。

1. **LLM自動生成モード**
   - キャラ編集画面の冒頭に、部屋作成フロー（3.3）と同様の「作成指示」欄（自由記述。例：「勝気な幼馴染、スポーツ少女、方言あり」）を配置し、「この指示でランダム生成」を実行
   - バックエンドがKoboldCppに「キャラ情報フォーマットで出力せよ」という生成指示を送り、作成指示の内容を踏まえたキャラクターシートを生成させる
   - あわせて容姿系フィールド（容姿特徴・目色形状・髪型髪色・体型・胸大きさ形・身体特徴等）から、Outfit（デフォルト衣装）のdanbooruタグ一次案もLLMに提案させる
   - 生成結果をパースしてCharacter編集フォームに反映

**フィールド単位のLLM再生成**
- キャラ情報フォーマットの各テキストフィールド（名前・性格・口調・容姿特徴等）の入力欄には、そのフィールドだけを個別に再生成する小さなボタンを併設する
- クリックすると、作成指示欄の内容と現在フォームに入力済みの他フィールドの値を文脈としてKoboldCppに渡し、そのフィールドの値だけを再生成してフォームに反映する（全体を作り直さず、気に入らない項目だけ振り直せるようにするため）
- 全体生成と同様、フォームに反映されるのみで即保存はされない

2. **フォーマット貼り付け登録モード**
   - 「キャラ情報：」から始まる指定フォーマットのテキストをそのまま貼り付けるテキストエリアを用意
   - 外部で作成済みのキャラクターシートを貼り付けるだけで、同じパーサーでCharacter編集フォームに反映（表記ゆれ・項目欠落があってもベストエフォートでパースし、埋まらなかった項目は空欄のまま編集を促す）
   - danbooruタグは貼り付けテキストに含まれないため、この場合もLLMに一次案を生成させる

両モードとも「キャラ情報フォーマット文字列 → Character構造化フィールド」という共通パーサーを使う（3.4冒頭の組み立てロジックの逆変換）。生成・パース対象は自然文フィールドとdanbooruタグ一次案のみで、立ち絵・表情差分画像や関係性初期値（RelationshipAxisのデフォルト値を使用）は対象外とし、保存後に別途ユーザーが用意する。

**danbooruタグ一次案のレビューUI（タグ選択チップ）**
- LLMが提案したタグ群は1つのテキストではなく、タグごとに個別のチップとして表示する（初期状態は全チップON）
- チップをクリックしてON/OFFをトグルでき、OFFにしたタグは最終的なimage_tagsに含まれない
- チップ一覧の下に「タグを追加」欄を設け、任意のタグを追加チップとして登録できる（追加分も同様にON/OFFトグル可能）
- 保存時はON状態のチップのタグ名をカンマ区切りで結合してOutfit.image_tagsとする
- このチップ選択UIはOutfitのdanbooruタグ編集箇所で共通利用する部品とする
- チップ一覧の下に、ON状態のタグを結合した**最終タグプレビュー**をテキスト欄として表示する。このテキスト欄は直接編集可能で、編集するとチップ側の選択状態（追加・削除・順序）に反映される。チップでの取捨選択では表現しづらい微調整（並び順の変更、重み付け記法`(tag:1.2)`の追加など）を直接編集で行うための逃げ道とする

### 3.6 イベントシステム

イベント定義は「条件（複数可）」＋「アクション（複数可）」の組み合わせで構成する汎用ルールとする。イベント判定はバックエンドが会話状態・関係性数値・フラグを見て行い、LLMの自己申告には依存しない。

#### 3.6.1 評価タイミング

1. ユーザーがメッセージを送信 → `keyword`条件のうち`target: user_message`を評価
2. LLM呼び出し・応答生成（`[EMOTION]`/`[SCENE_CHANGE]`タグ含む）
3. `keyword`条件のうち`target: ai_response`を評価
4. 部屋（セッション）に紐づく有効なイベント定義を全て走査し、残りの条件種別（`probability` `turn_count` `relationship_threshold` `flag_state` `participant_count`）を評価
5. 条件を満たした（かつcooldown・max_fires・排他制御をクリアした）イベントを`priority`順に実行し、アクションを適用
6. アクション結果（挿入台詞・生成画像・状態変化）をメッセージ/通知としてクライアントに反映

#### 3.6.2 イベント全体の制御項目（EventDefinition共通）

| 項目 | 型 | 説明 |
|---|---|---|
| condition_logic | "AND" \| "OR" | 複数条件の結合方法（デフォルトAND） |
| priority | int | 同一tickで複数イベントが該当した場合の実行順（小さいほど先） |
| cooldown_turns | int | このイベントが発火してから再度発火可能になるまでのターン数 |
| max_fires_per_session | int, nullable | 最大発火回数（null=無制限、1にすれば一回限りのシナリオイベントに使える）。**カラム名に反し、集計範囲は`reset_scope`で決まる**（歴史的経緯：当初はルート全体累計のみだった） |
| reset_scope | "playthrough" \| "session" | `cooldown_turns`／`max_fires_per_session`の集計をルート全体（デフォルト）にするか、部屋滞在（room_session）単位でリセットするかを選ぶ（2026-07-17、migration 0037） |
| exclusive_group | text, nullable | 同じグループ名を持つイベント同士は同一tickで排他（優先度が高い方のみ発火）。null なら排他制御なし＝該当イベントは全て発火 |

#### 3.6.3 条件（Condition）パラメータ仕様

**probability** - 確率判定
```json
{ "chance": 0.15 }
```
- `chance`: 0.0〜1.0。評価timing（ステップ4）ごとにこの確率で真になる

**turn_count** - 経過ターン数
```json
{ "reference": "playthrough_start", "comparison": ">=", "turns": 20 }
```
- `reference`: `"playthrough_start"`（所属ルート開始からの累計ターン数。部屋を移動してもリセットされない）/ `"flag_set"`（特定フラグが立ってから。`flag_key`を追加指定）/ `"last_fire_of_this_event"`（前回自身が発火してから）
- `comparison`: `">="` `"=="` `">"`
- `turns`: int
- イベント条件のターン数はルート単位の累計であり、3.3の`turns_per_time_slot`（部屋単位・時間帯自動進行専用のターン数）とは別のカウンタ

**keyword** - キーワード検出
```json
{ "keywords": ["秘密", "本当のこと"], "match_mode": "any", "target": "user_message", "case_sensitive": false }
```
- `keywords`: string配列
- `match_mode`: `"any"`（いずれか一致） / `"all"`（すべて含む）
- `target`: `"user_message"`（直近のユーザー発言） / `"ai_response"`（直近のAI応答全体） / `"any"`（両方）
- `case_sensitive`: bool（デフォルトfalse）

**relationship_threshold** - 関係性閾値
```json
{ "character_id": 3, "axis_id": 1, "comparison": ">=", "value": 80 }
```
- `character_id`: 対象キャラID（`"any_present"`で同席者のうち誰か1人でも満たせば真、`"mentioned"`でそのターンにチャットで@メンションされたキャラのうち誰か1人でも満たせば真、も許容。`"mentioned"`時は`mentioned_limit`（int、nullable）でメンション順の先頭何人までを対象にするか絞り込める。has_status/has_outfitも同じ`"any_present"`/`"mentioned"`/`mentioned_limit`の扱いに対応）
- `axis_id`: RelationshipAxisのID
- `comparison`: `">="` `"<="` `"=="` `">"` `"<"`
- `value`: int

**flag_state** - フラグ状態
```json
{ "flag_key": "confession_done", "comparison": "==", "value": "true" }
```
- `flag_key`: string
- `comparison`: `"=="` `"!="` `"exists"` `"not_exists"`（exists系は`value`不要）
- `value`: string（比較対象。数値もstring格納し数値変換して比較）
- `character_id`: nullable（未指定=ルート全体のグローバルフラグ、`session_flags`を参照。指定時はキャラ別フラグ`character_flags`を参照）。`"any_present"`で同席者のうち誰か1人でも満たせば真、`"mentioned"`でそのターンに@メンションされたキャラのうち誰か1人でも満たせば真、も許容（`mentioned_limit`で人数を絞り込み可）
- `scope`: `"playthrough"`（ルート永続）/ `"session"`（セッション内一時）。`character_id`指定時のみ有効、デフォルト`"playthrough"`

**participant_count** - 同席人数
```json
{ "comparison": "<=", "value": 1 }
```
- `comparison`: `">="` `"<="` `"=="`
- `value`: int

**has_money** - 所持金判定（2026-07-20追加）
```json
{ "comparison": ">=", "value": 5000 }
```
- `playthroughs.money`と比較する。`comparison`は`relationship_threshold`と同じ演算子集合（`">="` `"<="` `"=="` `">"` `"<"`）
- `value`: int

#### 3.6.4 アクション（Action）パラメータ仕様

**character_join** - キャラ参加
```json
{ "selection_mode": "random_weighted", "candidate_character_ids": [4,5,6], "outfit_id": null, "entrance_narration": "{character_name}がふらっと顔を出した。" }
```
- `selection_mode`: `"specific"`（`character_id`指定） / `"random_weighted"`（Character.event_participation_weightで重み抽選） / `"random_uniform"`（候補から均等抽選）
- `character_id` または `candidate_character_ids`: 対象。`selection_mode: "specific"`時の`character_id`は`"mentioned"`も許容（そのターンに@メンションされた先頭1人。誰もメンションされていなければアクションはスキップ）
- `outfit_id`: nullable（未指定はキャラのデフォルト衣装）
- `entrance_narration`: nullable。テンプレート文字列（`{character_name}`等の置換変数を許可）

**character_leave** - キャラ退出
```json
{ "selection_mode": "specific", "character_id": 4, "exit_narration": "{character_name}は静かに部屋を出て行った。" }
```
- `selection_mode`: `"specific"` / `"random_from_present"`
- `character_id`: `selection_mode: "specific"`時の対象。`"mentioned"`も許容（そのターンに@メンションされた先頭1人。誰もメンションされていなければアクションはスキップ）
- `exit_narration`: nullable

**insert_dialogue** - 台詞・ナレーション挿入
```json
{ "mode": "generated", "character_id": 3, "prompt_hint": "少し照れながら本音を漏らす一言を発言する", "emotion_tag": "blush" }
```
- `mode`: `"fixed"`（`text`を、`${target1}`等のプレースホルダー解決後に挿入） / `"generated"`（`prompt_hint`をLLMへの追加指示として渡し生成させる）
- `character_id`: nullable（nullは`[NARRATION]`として扱う）。`"mentioned"`も許容（そのターンに@メンションされた先頭1人。誰もメンションされていなければ`[NARRATION]`にはフォールバックせずアクション自体をスキップする）
- `text`: mode=fixedの場合の固定文。`generate_image`の`prompt_override`と同じ`${target1}`/`${target2}`/`${キャラ名}`プレースホルダー構文（2026-07-20追加）が使え、該当参加者の表示名に置換される——候補の優先順は`@メンション→同席者全員`（`target_character_ids`はこのアクションにはないため対象外）。`.category`サフィックスは名前解決では意味を持たないため無視される
- `prompt_hint`: mode=generatedの場合の生成ヒント
- `emotion_tag`: nullable。強制的に使う表情キー

**generate_image** - イベント専用画像生成
```json
{ "image_type": "event", "prompt_override": "${みお}, blush, on top of, ${かえで}, lying down", "target_character_ids": [3, 5] }
```
- `image_type`: `"scene"` / `"event"`
- `prompt_override`: nullable。ユーザーがイベントエディタ上で自由入力するdanbooruタグ・文章
  - `${キャラ名}`というプレースホルダーを埋め込むと、生成時にそのキャラクターの現在Outfitのdanbooruタグに置換される。複数キャラが絡む画像で「誰がどの役割・配置か」を書き分けたい場合に使う
  - プレースホルダーの中身（性的表現を含む具体的なタグ・文章）はユーザー自身がアプリのイベントエディタ上で入力するものであり、本仕様書や実装側で内容を事前定義・生成することはしない
- `target_character_ids`: nullable（未指定または空配列の場合：そのターンに@メンションされたキャラがいればそちらを優先、いなければ現在同席している全キャラ）。この画像に関係させるキャラの候補を絞り込む。プレースホルダーで参照されなかった候補キャラは、取りこぼし防止のためタグが自動的に末尾追加される（3.6参照）
- `mentioned_limit`: nullable（int）。`target_character_ids`が空で@メンションへフォールバックする際、メンション順の先頭何人までを対象にするか絞り込む（null=全員）
- `auto_append_unreferenced`: bool（デフォルト`true`）。`false`にすると上記の「取りこぼし防止」自動追加を無効化する——同席してはいるがそのシーンの描写に関与しないキャラの服装タグを混ぜたくない場合に、イベント単位でオフにできる（2026-07-20追加）

**set_flag** - フラグ操作
```json
{ "flag_key": "confession_done", "operation": "set", "value": "true" }
```
- `operation`: `"set"` / `"increment"` / `"decrement"` / `"toggle"`
- `value`: string（set時に使用。increment/decrementは数値文字列を数値変換して演算）
- `character_id`: nullable（未指定=ルート全体のグローバルフラグ、`session_flags`に書き込み。指定時はキャラ別フラグ`character_flags`に書き込み）。`"all_present"`で同席者全員に適用、`"mentioned"`で@メンションされたキャラ全員に適用（`mentioned_limit`で人数を絞り込み可）
- `scope`: `"playthrough"`（ルート永続）/ `"session"`（セッション内一時）。`character_id`指定時のみ有効、デフォルト`"playthrough"`

**change_relationship** - 関係性パラメータ変更
```json
{ "character_id": 3, "axis_id": 1, "operation": "add", "value": 5 }
```
- `character_id`: 対象（`"all_present"`（同席者全員）／`"mentioned"`（そのターンに@メンションされた全員、`mentioned_limit`で先頭何人までかを絞り込み可）も許容）
- `axis_id`: RelationshipAxisのID
- `operation`: `"add"` / `"subtract"` / `"set"`
- `value`: int（RelationshipAxisのmin/maxでクランプする）。change_status/set_addressも`character_id`の`"all_present"`/`"mentioned"`/`mentioned_limit`の扱いは同じ

**LLMによる状態値/関係値の自動増減（2026-07-20追加、migration 0056）**：上記`change_relationship`/自己ステータスの時間経過回復（`applySelfStatRegen`）はどちらもイベント作者が事前に決めた固定値の変更だが、この機構はLLMがその場の物語展開に応じて増減量を自由に判断する。状態値（自己ステータス）と関係値で仕組みが異なる：

- **状態値（自己ステータス、毎送信ごと）**：`worlds.self_stat_auto_update_enabled`（既定false、World単位オプトイン）が真のとき、通常の応答生成（1ターン1回のLLM呼び出し）に相乗りする形で、システムプロンプトに同席キャラ全員の現在の状態値（`scope='self_stat'`かつ`llm_auto_update_enabled=1`の軸のみ）を提示し、`[STAT_CHANGE: キャラ名|軸名|符号付き整数]`という新規出力タグ（`ITEM_GRANT`と同じ`|`区切り形式）で変化を申告させる。追加のLLM呼び出しを発生させない（毎送信ごとに実行するため、レイテンシ増を避ける設計判断）。`responseParser.js`の`parseScriptLine`が`{type:'stat_change', characterName, axisName, delta}`としてパースし、`roomSessions.js`の`handleParsedLine`がキャラ名・軸名を解決した上で`relationshipStatesRepo.js`の`adjustValue`（`operation:'add'`）を呼ぶ。キャラ名/軸名が解決できない行は黙って無視する（ITEM_GRANTのカテゴリ未一致と同じフォールバック思想）。
- **関係値（一定送信回数ごと、またはセッション終了時）**：`worlds.relationship_update_interval_turns`（nullable、既定null=無効、World単位で送信回数を設定）が設定されているとき、`server/src/services/relationshipAutoUpdate.js`の`maybeRunRelationshipAutoUpdate`が、プレイスルー累積ユーザーターン数が前回チェックポイント（`room_sessions.relationship_update_last_turn`）から設定間隔以上進んだ時点で発火する。イベントエンジンの`llm_judge`条件と同じ「単発のプレーンなuser roleメッセージに会話を埋め込み、低温度（temperature 0.2）で応答させる」方式の**専用の追加LLM呼び出し**（間隔を空けて実行するためレイテンシ増を許容できる）で、直近の会話とキャラごとの現在の関係値（`scope='relationship'`かつ`llm_auto_update_enabled=1`の軸のみ）を提示し、「キャラ名|軸名|符号付き整数」形式の複数行、または変化なしの場合は「変化なし」で応答させる。セッションが終了する時点（`/exit`ルート、または部屋移動`/move`ルート）でも`{force:true}`で追い上げ実行され、間隔未達分の会話も取りこぼさない。
- 両者とも`relationship_axes.llm_auto_update_enabled`（既定true）で軸ごとに対象から除外できる（関係性軸／自己ステータスマスター画面）。既存の`change_relationship`イベントアクションとは独立に動作し併用可能（同じ`adjustValue`を経由するため、しきい値連動の`axis_status_triggers`もどちらの経路でも自動的に効く）。値の変化は`world.notify_relationship_changes`が真の場合、既存の`relationship_changed`通知（チャット画面のトースト表示）で両方とも共有される。

**change_outfit** - 衣装変更
```json
{ "character_id": 3, "outfit_id": 7 }
```
- `character_id`: 対象。`"mentioned"`も許容（そのターンに@メンションされた先頭1人。誰もメンションされていなければアクションはスキップ）
- `outfit_id`: 切り替え先Outfit ID

**advance_time** - ルートの時間経過を強制的に進める
```json
{ "slots": 1 }
```
- `slots`: 進める時間帯の数（int、デフォルト1）。3.2の「時間帯を1つ進める」処理をこの回数分繰り返す（日またぎ・天候再抽選・季節進行もその都度評価される）
- 対象は、このイベントが発火した部屋（RoomSession）が所属するPlaythrough

**spend_money** - 所持金消費（2026-07-20追加）
```json
{ "amount": 5000 }
```
- `playthroughs.money`から`amount`を減算する（`has_money`条件でのガードを前提としており、それ自体は残高不足チェックを行わない）

**set_scene_situation** - 現在の場面状況を設定（2026-07-20追加）
```json
{ "text": "${target1}と二人きりでイチャイチャしてる" }
```
- `text`: `room_sessions.current_scene_situation`に書き込まれる自由記述文。`insert_dialogue`の固定文と同じ`${target1}`/`${target2}`/`${キャラ名}`プレースホルダー構文が使え、該当参加者の表示名に置換される（候補の優先順：`@メンション→同席者全員`）
- 部屋セッションが続く限り persists し、`buildSystemPrompt`から`現在の場面状況：〜`として毎ターンLLMに渡る。次にこのアクションが再実行されて上書きされるか、部屋移動（新規セッション作成）で自動的にリセットされる

### 3.7 画像生成

**トリガー**
- シーン転換検知（LLM出力の`[SCENE_CHANGE]`タグ）
- イベント発火（イベントアクション「画像生成」）

**プロンプト合成ロジック**
1. 場所・雰囲気の画像生成タグ（テンプレート or 現在のシーン状態）
2. 選択済みPropのdanbooruタグ
3. イベント発火によるgenerate_imageで`prompt_override`が指定されている場合：その文字列内の`${キャラ名}`プレースホルダーを、該当キャラの現在Outfitのdanbooruタグに置換したものを連結する（プレースホルダー詳細は3.5.4参照）
4. `target_character_ids`のうちプレースホルダーで明示的に参照されなかったキャラ（シーン転換検知時は同席する全キャラ）の現在Outfitのdanbooruタグを、取りこぼし防止のため末尾に自動追加
5. 自由記述項目（場所・雰囲気の文章、ライブラリ外の設備）は画像生成タグに含めない（LLMコンテキストのみ）

**制御**
- 生成中はキューイングし、同時実行を回避
- 生成完了はWebSocket/SSEでフロントエンドに通知、非同期でチャットをブロックしない
- 通常会話中の表情表示はOutfitに紐づく事前生成済み差分画像（顔差分・立ち絵）を即時表示

**外見一貫性のための参照アンカーinpainting方式**

画像生成バックエンドはKoboldCpp内蔵SD（stable-diffusion.cpp）を使うため、IP-Adapterは利用できない（SDXLではControlNetも非対応）。そのため、`/sdapi/v1/img2img`のマスク付きinpainting機能（KoboldCpp v1.88以降で対応）を使い、以下の手順でキャラクター外見の一貫性を担保する。

1. 生成対象より広いキャンバスを用意し、キャラのOutfitに登録済みの立ち絵イメージ（3.5参照）を端の固定領域（参照アンカー領域）に配置する
2. マスクを作成し、参照アンカー領域は保護（生成対象外）、残りの本編領域のみ生成対象にする
3. `init_images`に上記キャンバス、`mask`に上記マスクを指定し、プロンプトは3.7の合成ロジック通りのdanbooruタグでinpaintingを実行
4. 生成結果から本編領域のみを切り出し、参照アンカー部分を破棄したものを最終的な生成画像とする

高速化のため、Illustrious XLにSDXL-Lightning系LoRA（`--sdlora`で指定）を適用し、生成ステップ数を4〜8程度に抑える構成を基本とする。denoising_strengthやアンカー領域の配置・マスクの境界処理は実機でのチューニングが必要な項目として残す。

**アンカー境界の区切り線（2026-07-17追加）**：`buildReferenceAnchorCanvas`は参照アンカー領域とその右の本編生成領域の境界に幅3pxの黒い縦線を合成する。マスクには反映されない（あくまで生成入力画像側の視覚的ヒントで、i2iの塗り替え可否には影響しない）——「2koma」等のタグを使ったコマ割り構図をより誘発しやすくする目的。区切り線はアンカー領域側の右端3pxに乗るため、本編領域の切り出し（`cropMainRegion`）には含まれない。Settings画面のtest-generateには`previewFullCanvas`オプションがあり、有効にするとクロップ前の全体キャンバス（アンカー領域＋区切り線込み）をそのままプレビューできる。

**表示位置**
- 生成されたシーン・イベント画像は会話ログの流れの中に、発生した時点のメッセージとして割り込み挿入する（別枠パネルへの表示に留めない）
- セッション開始直後、まだシーン転換が発生していない間はRoomTemplateの固定「背景イメージ」をデフォルト表示する

**画像スタイルプリセット**

画風・品質タグ・アーティスト名などを登録できる「画像スタイルプリセット」を複数保持できる（設定画面で管理）。プリセットのプロンプトは、そのプリセットを使う全ての画像生成呼び出し（シーン・イベント・立ち絵・表情差分・画像生成テスト）で、合成プロンプトの先頭に自動付加される。

- 1つのプリセットに`is_default`（既定）フラグを立てられ、常にちょうど1つが既定となる
- World（3.1）は使用するプリセットを任意選択でき、未指定の場合は既定のプリセットが使われる
- Outfitの立ち絵・表情差分生成（3.5）はWorldに紐づかないため、常に既定のプリセットを使用する
- 既定のプリセットは削除できない

**出力画像形式**

画像の種類（立ち絵／表情差分／シーン／イベント）ごとに、保存形式（PNG または JPG）を設定画面で指定できる。

**画像種別ごとの生成方式・プロンプトテンプレート設定**

画像の種類（立ち絵／表情差分／シーン／イベント／部屋の背景／World代表画像）ごとに、以下を設定画面で個別に指定できる。前述の参照アンカーinpainting方式は本来キャラの一貫性を保つ狙いだが、本編領域が完全な空白から生成されるため、`steps`/`cfg_scale`が低いとキャラがほとんど描かれず背景だけになる、生成ごとに構図が大きくばらつくといった問題が起きうる。そのため一貫性と安定性のトレードオフをユーザー自身が種別ごとに選べるようにする。

- `default_mode`：`anchor_i2i`（参照アンカーinpainting方式。3.7前半参照）／`prompt_only`（プレーンなtxt2img。参照画像を使わず毎回自由に生成するため一貫性はないが、上記の構図崩れが起きない）。手動生成ボタンを持つ種別（表情差分）では、生成の都度ここをUI上で選び直せる。自動発火する種別（シーン・イベント）は発火時にユーザーが選べないため、この既定値がそのまま使われる
- `prompt_template`：種別ごとに固定されたプレースホルダー変数（例：`${style_preset}`, `${character_tags}`, `${expression_tag}`, `${location_tags}`, `${atmosphere_tags}`, `${prop_tags}`, `${world_tags}`, `${extra_hint}`）を含むテンプレート文字列。置換後、空になった項目は前後のカンマごと除去される。設定画面では各変数名をタップ/ホバーすると説明が表示される
- キャンバス・サンプリング設定：`main_width`/`main_height`（出力サイズ）、`anchor_width`（参照アンカー領域の幅、i2i用）、`steps`、`cfg_scale`、`denoising_strength`（i2i用）、`sampler_name`（KoboldCppの`/sdapi/v1/samplers`から取得した一覧、または未接続時は静的フォールバック一覧から選択）
- イベントの`generate_image`アクションが持つ`prompt_override`の`${target1}`/`${target2}`/`${キャラ名}`プレースホルダー（3.6.4参照）は、ここで設定するテンプレートとは別レイヤーとして、合成後のプロンプト末尾に追加で連結される

**画像生成テスト機能**

キャラクターやRoomSessionに紐づかない、プロンプト直接入力による単発の画像生成機能を設定画面に用意する。スタイルプリセットの効果や、任意のdanbooruタグの見え方を素早く確認する用途。

種別ごとの詳細設定画面には、これとは別に「この設定でテスト生成」機能を用意する。編集中（未保存でも可）の生成方式・プロンプトテンプレート・パラメータをそのまま使い、その種別が参照するデータ（衣装・部屋セッション・部屋テンプレート・Worldなど）のうち最も若いIDのレコードをサンプルとして変数に当てはめ、実際に生成する。生成結果はどのエンティティにも保存しない使い捨てのプレビューで、`anchor_i2i`を指定していてもサンプルに参照画像がない場合は自動的に`prompt_only`にフォールバックする（その場合はUI上に実際の生成方式を明示する）。

**KoboldCpp起動設定**

設定画面の「KoboldCppを起動」ボタン（`koboldcppLauncher.js`）が参照する`koboldcpp_launch_settings`（単一行、id=1）を、設定画面上で編集できる。テキストモデル（`koboldcpp/models/llm/`）・画像生成モデル（`koboldcpp/models/sd/`または`koboldcpp/models/anima/`）は、各フォルダの実ファイル一覧（`GET /settings/koboldcpp-model-files`）からドロップダウンで選択する方式で、自由入力のパス欄ではない。未選択（空欄）の場合は該当フォルダ内の最初のファイルを自動選択する——本プロジェクトはGemma4を推奨モデルとしており、`models/llm/`には現状Gemma4のみを配置しているため、この自動選択で実質Gemma4が既定になる。

画像生成のアーキテクチャは`sd_architecture`（`sd`／`anima`）で切り替える。標準の`sd`は`--sdmodel`のみで起動するのに対し、Animaアーキテクチャは本体モデルに加えVAE・CLIPテキストエンコーダの個別ファイル指定が必須（`--sdvae`/`--sdclip1`）で、どちらも`models/anima/`内のファイルから選ぶ（VAE/CLIPの自動判別手段はないため、ファイル名から目視で選択する）。LoRA（`sd_lora_path`）は従来通り自由入力のまま。

**LLM応答生成の詳細設定**

KoboldCpp起動設定（exe引数）とは別に、生成のたびに`/v1/chat/completions`へ送るサンプリングパラメータを`llm_generation_settings`（単一行）で設定画面から調整できる：`temperature`・`rep_pen`（繰り返しペナルティ）・`rep_pen_range`・`top_p`・`top_k`・`min_p`。`koboldClient.js`の`generateChatCompletion`は呼び出し元がこれらを明示指定しなかった場合にこの設定値をデフォルトとして使う（`max_tokens`/`stop`等、呼び出し元が明示指定する値はそのまま優先）ため、チャット応答・キャラクター生成補助・イベントのLLM系アクションなど全呼び出し元に自動適用される。

プレイヤーが同じ行動を繰り返すとチャット応答が同一内容を繰り返す現象は、既定の`rep_pen`が弱い（もしくは未指定）ことに起因するため、この設定を上げることで緩和できる。

### 3.8 LLM応答生成

- 部屋に複数キャラが同席する場合、**1回の呼び出しで複数キャラ分の台詞を一括生成**（スクリプト形式）
- 発言者は基本自動選択（同席キャラのうち自然な範囲で応答）、ユーザーが名指し・UI指名した場合は必ずそのキャラの発言を含める
- 出力フォーマット：
  ```
  [キャラ名]: セリフ本文 [EMOTION:expression_key]
  [キャラ名2]: セリフ本文 [EMOTION:expression_key]
  [NARRATION]: 地の文・情景描写（任意）
  [SCENE_CHANGE]: 場所や状況が変わった場合のみ出力（任意）
  ```
- KoboldCppのstop sequenceに「ユーザー:」等を設定し、AIがユーザー発言まで生成することを防止
- フォーマット逸脱時（EMOTIONタグ省略等）は「通常」表情にフォールバック
- フォーマット崩れ耐性（2026-07-18追加）：`responseParser.js`は正規の`[キャラ名]: セリフ`に加え、モデルが名前をブラケット外に出した`キャラ名[表情]: セリフ`という順序も救済パースする（`NAME_THEN_BRACKET_PATTERN`）。キャラ名の解決も完全一致優先だが、一致しない場合は`display_name`同士の部分文字列一致が一意に定まる場合のみフォールバックする（`roomSessions.js`の`resolveParticipantFuzzy`）。一致するキャラかつセリフ本文が空の行はメッセージ化せず破棄する（空吹き出し防止）。システムプロンプトにも文体トーン指示と誤りフォーマット例を追加し、モデル側の遵守率を上げる方針を併用している。

### 3.9 UI/UX

- PC：部屋一覧／参加キャラ一覧／チャット／画像表示のマルチカラムレイアウト
  - 右側の「現在のシーン」パネルは折りたたみ可能とし、開いている間は直近のシーン画像を常時表示する補助として使う（正本の履歴はあくまでチャットのタイムライン内）
- スマホ：単一カラム＋折り畳みメニュー
- 画面：世界観管理、部屋一覧・セッション選択（World単位でグルーピング）、部屋作成・設定、キャラ管理（手動フォーム／LLM自動生成／フォーマット貼り付け登録の3導線）、イベント定義エディタ、チャット画面
- 設定画面：KoboldCppの接続状況（テキストモデル／SDモデル）表示に加え、未接続時は「KoboldCppを起動」ボタンを表示する。サーバーと同じPC上でkoboldcpp.exeをデタッチ起動し（`koboldcpp/`直下または`koboldcpp/models/`配下の実行ファイル、`koboldcpp/models/llm/`の`.gguf`、`koboldcpp/models/sd/`の`.safetensors`を自動検出）、押下から接続完了まではブラウザを閉じても継続する。同等の手順を手動実行できる起動batファイル（`start-koboldcpp.bat`）も`koboldcpp/`フォルダに同梱する

---

## 4. DB構造

### worlds
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| name | text | |
| worldview | text | 基本世界観（所属部屋がinherit時に使用） |
| is_unassigned_bucket | bool | 「未所属」予約枠フラグ。true の行は削除不可・常に1件のみ |
| time_slot_labels | json | 時間帯ラベルの順序付き配列（例：["朝","昼","放課後","夜"]） |
| weather_options | json | 天候候補の配列（日をまたぐ際にランダム抽選） |
| season_labels | json | 季節ラベルの順序付き配列（例：["春","夏","秋","冬"]） |
| days_per_season | int | 季節が1つ進む日数間隔 |
| day_of_week_labels | json | 曜日ラベルの順序付き配列（デフォルト["月","火","水","木","金","土","日"]、7日固定ではなくWorldごとに自由に変更可能。2026-07-17） |
| holiday_weekday_indices | json | 休日にする曜日の`day_of_week_labels`インデックス配列（例：[5,6]で土日、2026-07-17） |
| image_style_preset_id | FK, nullable | 使用する画像スタイルプリセット（3.7）。null時は既定のプリセットを使用 |
| image_tags | text | World代表画像（3.7）の生成用danbooruタグ |
| thumbnail_image_path | text, nullable | World代表画像のファイルパス（アップロードまたはAI生成） |
| protagonist_mode | text | `character` / `narrator`（3.2.1）。ルート側で上書きしない場合の既定値 |
| protagonist_name | text | 主人公の名前（既定値） |
| protagonist_nickname | text | 主人公のあだ名・主な呼ばれ方（既定値。空なら「あなた」として扱う） |
| protagonist_occupation | text | 主人公の職業・世界観内での立場（既定値） |
| protagonist_appearance | text | 主人公の容貌・外見的特徴（既定値） |
| protagonist_gender | text | 主人公の性別（既定値） |
| protagonist_notes | text | 主人公のその他情報・自由記述（既定値） |
| created_at | datetime | |

### playthroughs（ルート）
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| world_id | FK | 所属World |
| name | text | 例：「純愛ルート」 |
| current_day | int | 現在の日数（1始まり） |
| current_time_slot_index | int | worldsのtime_slot_labels中のインデックス |
| current_weather | text | 直近で抽選された天候 |
| current_season_index | int | worldsのseason_labels中のインデックス |
| status | text | active / ended |

`current_day`から曜日・休日は毎回導出する（永続列は持たない）：`(current_day - 1) % day_of_week_labels.length`が曜日index、`((current_day - 1) % (days_per_season × season_labels数)) + 1`が「年内の日数」。休日判定は`holiday_weekday_indices`に該当曜日indexが含まれるか、または後述の`world_calendar_holidays`に該当日が登録されているかのOR。`advanceTime`が変化時に`flag_state`条件用のフラグ（`day_of_week`／`is_holiday`）をセットする（season/time_slot/weatherと同じ仕組み、専用condition_typeは新設していない）。APIレスポンスには`current_day_of_week_label`／`current_is_holiday`として付与される。

### world_calendar_holidays（個別の休日、2026-07-17）
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| world_id | FK | |
| day_of_year | int | 「年内の日数」（1始まり）。暦が一周するたび毎年繰り返す。曜日ベースの休日とは独立に判定される |
| label | text | 管理用の表示名（例：「文化祭」）。フラグ値には使われない、UI表示のみ |
| use_custom_protagonist | bool | false時はworldsの主人公設定一式を継承。true時は以下の列を使用（3.2.1） |
| protagonist_mode | text | `character` / `narrator`。use_custom_protagonist=true時のみ使用 |
| protagonist_name | text | ルート専用の主人公名。use_custom_protagonist=true時のみ使用 |
| protagonist_nickname | text | ルート専用のあだ名。use_custom_protagonist=true時のみ使用 |
| protagonist_occupation | text | ルート専用の職業・立場。use_custom_protagonist=true時のみ使用 |
| protagonist_appearance | text | ルート専用の容貌。use_custom_protagonist=true時のみ使用 |
| protagonist_gender | text | ルート専用の性別。use_custom_protagonist=true時のみ使用 |
| protagonist_notes | text | ルート専用のその他情報。use_custom_protagonist=true時のみ使用 |
| created_at | datetime | |
| updated_at | datetime | |

### room_templates
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| world_id | FK | 所属World。未指定時はis_unassigned_bucket=trueのWorldを指す |
| worldview_mode | text | inherit / custom |
| name | text | |
| initial_situation | text | 開始時シチュエーション |
| location_text | text | 場所（自由記述） |
| location_tags | text, nullable | 画像生成用タグ |
| atmosphere_text | text | 雰囲気（自由記述） |
| atmosphere_tags | text, nullable | 画像生成用タグ |
| worldview | text, nullable | 部屋固有の世界観（worldview_mode=customの場合のみ使用） |
| background_image_path | text, nullable | 固定背景画像（シーン転換前のデフォルト表示用） |
| turns_per_time_slot | int, nullable | この部屋滞在中、何ターンで自動的にルートの時間帯を1つ進めるか（null=このトリガー無効） |
| is_shop | bool | 買い物できる部屋か（詳細は下記「貨幣機能 + 買い物部屋」） |
| suppress_auto_population | bool | 2026-07-20追加（migration 0050）。trueの部屋は入室時、タグ一致自動出現・行単位ランダムを含む通常のデフォルト参加者決定を一切スキップする（同行キャラの引き継ぎのみそのまま機能）。「ホテルの部屋」のような、乱入なく同行キャラとだけ会話したいプライベート部屋向け |
| created_at | datetime | |

### room_template_characters
（`0030_room_world_decoupling.sql`で`room_template_participant_slots`＋`world_room_slot_assignments`に置き換え済み。以下が現行の実データ）

### room_template_participant_slots（部屋マスタ側の抽象枠）
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| room_template_id | FK | |
| attribute_tags | text | この枠の属性タグ。管理UIでの候補キャラ強調表示に加え、2026-07-18からは行単位ランダム割り当て（下記）の照合対象としても使用 |
| note | text | 枠の説明（例：「生徒B」） |
| sort_order | int | |

### world_room_slot_assignments（Worldごとの具体キャラ割り当て、2026-07-18拡張）
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | 2026-07-17に複合PK(world_id, slot_id)から変更——1枠に複数キャラを割り当てられるようにするため |
| world_id | FK | |
| slot_id | FK | `room_template_participant_slots.id` |
| character_id | FK, nullable | **NULL＝ランダム行**（2026-07-18、下記参照）。非NULLは従来通りの固定キャラ割り当て |
| time_slot_indices | json | `worlds.time_slot_labels`へのindex配列。空＝常に在室、非空＝その時間帯のみ在室（1枠に時間帯違いの複数行を持たせることで「朝はキャラX、夜はキャラY」を表現できる） |
| random_fill_mode | text | `always`（候補がいれば必ず1人選出）／`probability`（`random_probability`の確率で抽選、外れれば0人）。ランダム行（`character_id IS NULL`）にのみ意味を持つ |
| random_probability | real | `random_fill_mode='probability'`時の出現確率（0.0〜1.0） |

**部屋入室時のデフォルト参加者決定**（`worldRoomSlotAssignmentsRepo.js`の`listDefaultParticipantCharacterIdsForWorldRoom`）は3つの仕組みを合算する：
1. **固定割り当て**（`character_id`が非NULLの行、現在の時間帯でフィルタ）
2. **属性キー一致による自動出現**：部屋マスタの`attribute_tags`（設定されていればそれのみ）、無ければWorldの`attribute_tags`にフォールバック——**合算ではなくフォールバック**（2026-07-19変更、`characterJoin.js`の`getContextTags`も同様）——と重なる`attribute_tags`を持つ**全キャラ**（`attributeTagMatching.js`、`characterJoin.js`の`tag_match`と同じロジック）が、枠への割り当て有無に関わらず自動的にデフォルト参加者になる（時間帯フィルタなし）。部屋をWorldにアタッチした際、部屋側の`attribute_tags`が空ならWorldの値を初期値として自動コピーする（`worldRoomTemplatesRepo.js`の`attachRoomToWorld`、以後は独立して編集可能）。この(World,部屋)ペアに`world_room_templates.tag_match_max_count`（2026-07-20追加、nullable）が設定されていて一致候補数がそれを超える場合は、`event_participation_weight`による重み付きランダムでその人数だけ抽選する（未設定または候補数以下なら従来通り全員）——`RoomWorldConfigPage.jsx`の「属性キー一致での最大人数」欄で設定
3. **行単位ランダム割り当て**（`character_id IS NULL`の行、2026-07-18追加、前回実装した枠単位トグル`world_room_slot_random_tag_match`を完全に置き換え）：行ごとに、**その行が属する枠自身の`attribute_tags`**（部屋/World全体のタグではない）と重なる`attribute_tags`を持つキャラの中から`event_participation_weight`で重み付きランダムに**最大1人**選出。`random_fill_mode='probability'`なら抽選が外れた行は0人のまま。1枠に複数のランダム行を作ることで「0〜行数」の範囲で人数が変動する状況を作れる。既に確定した参加者（固定割り当て・属性一致全員）とは重複しないよう除外されるが、**`characters.is_mob`のキャラのみ例外的に重複選出を許可**——同じモブが複数のランダム行から選ばれると、`room_session_characters`に同一`character_id`の複数行が作られ（2026-07-18に複合PKからsurrogate `id` PKへ変更、重複を許可）、`participantNaming.js`の`withDisambiguatedNames`が英字接尾辞（`モブ・中学生`／`モブ・中学生A`／`モブ・中学生B`...）で区別する。**既知の制約**：モブ重複インスタンス間の関係性・ステータス・呼び方は`(character_id, room_session_id)`単位でしか管理できないため内部状態は共有される（見た目上は別人だが、関係値やステータスは連動する）。

**属性キー`すべて`ワイルドカード**（2026-07-18、`attributeTagMatching.js`の`tagsOverlapOrWildcard`）：部屋マスタ・World・枠のいずれかの`attribute_tags`に特殊トークン`すべて`を含めると、そのタグ集合との照合は無条件でマッチしたことになる——候補キャラ側が`attribute_tags`を1件も持たない（未所属）場合でも対象になる。上記2の属性一致自動出現・3の行単位ランダム割り当て（枠自身のタグが対象）、および`characterJoin.js`の`tag_match`選出・`require_attribute_match`ガードの計4箇所で共通して有効。管理UIのタグ入力は既存のカンマ区切りテキストのままで、`すべて`を1つのタグとして入力するだけでよい。

### props（設備・機材マスター）
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| name | text | |
| danbooru_tags | text | |
| category | text, nullable | |
| description | text, nullable | |

### room_template_props
| カラム | 型 | 備考 |
|---|---|---|
| room_template_id | FK | |
| prop_id | FK | |

### room_template_free_props（ライブラリ外の自由記述設備）
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| room_template_id | FK | |
| description | text | 画像生成には使わずLLM文脈のみ |

### room_template_events
| カラム | 型 | 備考 |
|---|---|---|
| room_template_id | FK | |
| event_definition_id | FK | |
| override_probability | float, nullable | 部屋固有の確率上書き |

### room_sessions
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| room_template_id | FK | |
| playthrough_id | FK | 所属Playthrough（ルート） |
| entered_day | int | 訪問開始時点のルートの日数（作成時に固定） |
| entered_time_slot_index | int | 訪問開始時点のルートの時間帯インデックス（作成時に固定） |
| started_at | datetime | |
| updated_at | datetime | 最終メッセージ・状態変化の日時。セッション一覧の並び替え・「続きから」表示に使用 |
| current_location_text | text | |
| current_location_tags | text, nullable | |
| current_atmosphere_text | text | |
| current_atmosphere_tags | text, nullable | |
| current_scene_image_id | FK, nullable | generated_imagesを参照。再開時・折りたたみパネルに即表示するための直近シーン画像ポインタ |
| current_scene_situation | text | イベントアクション`set_scene_situation`（2026-07-20追加）が書き込む自由記述の「現在の場面状況」。`buildSystemPrompt`から`現在の場面状況：〜`として地の文生成に渡る。部屋セッション単位のため、部屋移動（＝新規セッション作成）で自動的に空に戻る |
| status | text | active（滞在中）/ ended（退出済み。ended化のタイミングでルートの時間経過処理を実行） |

### room_session_characters
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | 2026-07-18に複合PK(room_session_id, character_id)から変更——モブキャラ（`characters.is_mob`）が同一セッションに複数インスタンスとして重複参加できるようにするため（一意制約なし、非モブの重複防止はアプリ側ロジックで担保） |
| room_session_id | FK | |
| character_id | FK | |
| joined_at | datetime | |
| left_at | datetime, nullable | |
| current_outfit_id | FK, nullable | 未指定時はデフォルト衣装 |
| is_active | bool | 現在同席中か。退席（`removeParticipant`）は`is_active=0`+`left_at`更新のみで行自体は残す |
| is_accompanying | bool | 部屋移動時に同行するか |

**退席キャラの扱い**（2026-07-19）：`roomSessionsRepo.js`の`attachParticipants`は`participants`（現在アクティブのみ、既存UI各所が使用）と`all_participants`（退席済み含む全員）の両方をセッションに含める。`ChatPage.jsx`/`SessionLogPage.jsx`の過去メッセージ名前・表情画像解決は`all_participants`を参照するため、退席後も過去ログの表示が「???」にならない。また`promptBuilder.js`の`buildHistoryMessages`は退席イベントをメッセージ履歴と時系列マージし、実際に退席が起きた位置に`[NARRATION]: （ここで◯◯は退席した...）`という合成行を挿入してLLMへ送る——退席後もそのキャラが発言し続けてしまう問題への対策（`buildSystemPrompt`にも退席済みキャラを名指しで禁止する行を追加）。

**モブ重複インスタンスの状態分離**（2026-07-19、migration 0045）：`relationship_states`・`character_address_states`・`character_status_states`に`room_session_character_id`（nullable、`room_session_characters.id`参照）を追加——同一モブキャラが同一セッションに複数インスタンス（`room_session_characters`の別行）として重複参加している場合、各インスタンスが独立した関係値・呼び方・ステータスを持てるようになった（従来は`(character_id, room_session_id)`単位でしか管理できず共有されていた既知の制約——[[room_slot_row_level_random_and_mob_duplication]]参照）。非モブキャラは常に`room_session_character_id: NULL`（各リポジトリのモブ判定ゲートで強制、意図せずインスタンス分断されないよう保護）。
- `roomSessions.js`の`resolveMentions`は`withDisambiguatedNames`の`display_name`（`モブ・中学生`/`モブ・中学生A`等）でマッチするよう変更——同名重複インスタンスも`@mention`で個別に指定できる。
- `generateReply`は`lastSpokenInstanceByCharacter`（そのターンで最後に発言したインスタンスのMap）を追跡し、明示的`@mention`が無い場合のフォールバックとして`instanceHintByCharacterId`経由でイベントアクション（`change_relationship`/`set_address`/`change_status`）に渡す。
- `character_status_states`の`persistence_scope: 'accompanying'`キャリーオーバー（部屋移動時）は、インスタンス単位の引き継ぎは行わない（移動先セッションで同一インスタンスの存在が保証されないため）——キャリーオーバー後は`room_session_character_id: NULL`にフォールバックする、既知の制約。

### characters
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| name | text | 名前（愛称） |
| full_name | text | 本名 |
| full_name_reading | text | 読み |
| nickname | text | あだ名 |
| occupation | text | 職業 |
| age_real | text | 実年齢 |
| age_apparent | text | 外見年齢 |
| race | text | 種族 |
| attribute | text | 属性 |
| appearance_features | text | 容姿特徴 |
| eye_description | text | 目色形状 |
| hair_description | text | 髪型髪色 |
| body_type | text | 体型 |
| bust_description | text | 胸大きさ形 |
| physical_features | text | 身体特徴 |
| first_person | text | 一人称 |
| call_user_as | text | あなたを呼ぶ呼称 |
| call_others_as | text | 他人を呼ぶ呼称 |
| personality | text | 性格 |
| speech_style | text | 口調 |
| sentence_ending | text | 語尾 |
| behavior_principle | text | 行動原理 |
| social_tendency | text | 対人傾向 |
| habits | text | 癖口癖 |
| likes | text | 好物 |
| dislikes | text | 苦手 |
| skills | text | スキル技能 |
| special_skills | text | 特殊スキル |
| weakness | text | 弱点 |
| secret | text | 秘密 |
| notes | text | 備考 |
| event_participation_weight | float | ランダム参加重み |
| created_at | datetime | |
| attribute_tags | text | 属性キー（カンマ区切り）。World・部屋の属性キーと一致すると自動登場/同席の対象になる |
| is_mob | bool | モブキャラフラグ（2026-07-17追加、migration 0041）。関係値・呼び方・自己ステータスが`playthrough_id`でなく`room_session_id`スコープになり、部屋セッションごとにリセットされる |

**「所属World」の算出**（`CharactersPage.jsx`表示用、実体を持つ列ではない）：`charactersRepo.js`の`listCharacters()`が`world_ids`を合成して各キャラに付与する。3つの経路を合算する——(1) `world_room_slot_assignments`の固定`character_id`割り当て（`listWorldIdsForCharacter`）、(2) 属性キー一致で出現しうる経路（`listTagDerivedWorldIdsByCharacter`、2026-07-19追加）：Worldごとに「そのWorldの全部屋の文脈タグ（部屋自身のタグ、無ければWorldへフォールバック）＋全部屋の行単位ランダム枠のタグ」を1回だけ集計してタグ集合を作り、キャラテーブルを1回だけ走査して一致判定する（キャラ単位でWorldごとに再計算するより低コスト）。時間帯・確率は考慮しない（「出現しうるか」だけを見る）、(3) `world_characters`への明示的アタッチ（2026-07-19追加、`worldCharactersRepo.js`、`world_room_templates`/`world_character_statuses`と同じ単純な中間テーブル。`CharactersPage.jsx`の「所属World（明示的アタッチ）」セクションからアタッチ/デタッチできる）。(1)(2)を置き換えるものではなく追加のみ——自動バックフィルはしていないため、既存キャラは誰も明示アタッチされていない状態からスタートする。`getCharacter()`単体取得には付与されない。差分上書き・環境非依存の汎用IDは別課題として未着手（[[character_world_membership_and_list_ui_backlog]]参照）。

### outfits
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| character_id | FK | |
| name | text | 制服／私服／水着等 |
| clothing_description | text | 服装（自然文、キャラ情報フォーマット用） |
| equipment_description | text | 装備（自然文、キャラ情報フォーマット用） |
| standing_image_path | text, nullable | 立ち絵（衣装につき1枚、表情バリエーションなし） |
| is_default | bool | |
| main_features 〜 belongings | text（19列） | danbooruタグカテゴリ群（下記参照）。旧`image_tags`（単一自由記述）を置き換え |

**danbooruタグカテゴリ**（`OUTFIT_TAG_FIELDS`, `server/src/db/repositories/outfitsRepo.js`）：`main_features` `hairstyle` `clothing_main` `clothing_face` `clothing_upper` `clothing_lower` `clothing_legs` `shoes` `clothing_face_outer` `clothing_upper_outer` `clothing_lower_outer` `clothing_legs_outer` `clothing_face_equipment` `clothing_upper_equipment` `clothing_lower_equipment` `clothing_legs_equipment` `underwear_upper` `underwear_lower` `belongings`。CharactersPageのOutfitエディタでカテゴリごとに個別編集し、画像生成時は`resolveOutfitTags`（`server/src/services/outfitTagCategories.js`）が用途に応じて結合する。

- `_outer`列：上着・重ね着（ジャケット・コートなど、脱ぎ着が自然なもの）
- `_equipment`列：追加装備（鎧・銃ホルダーなど、普段着でないもの）
- `underwear_upper`/`underwear_lower`：下着（`underwear_lower`は水着も含む想定）。`belongings`と同様にどのレンジプリセットにも含まれず、`${target1.underwear_upper}`のように個別参照する

**ショット範囲プリセット**：イベント／シーン画像生成のプロンプトテンプレートで`${target1.upperbody}`のように参照できるショット範囲名。`upperbody`/`cowboyshot`/`lowerbody`/`fullbody`の4種類、それぞれ以下のバリエーションを持つ：

| キー例 | 内容 |
|---|---|
| `upperbody`（無印） | ベース衣装のみ |
| `upperbody_outer` | 上着・重ね着のみ |
| `upperbody_equipment` | 追加装備のみ |
| `upperbody_full` | ベース＋上着＋追加装備（下着は含まない） |

下着を見せる演出をしたい場合はレンジプリセットではなく`${target1.underwear_upper}`／`${target1.underwear_lower}`を個別に指定する。

**World所属（2026-07-17変更）**：`character_statuses`は部屋テンプレートと同じくWorld横断の共有マスタになった。`world_character_statuses(world_id, status_id)`中間テーブルに行が無いステータスは共通（全Worldで使用可能）、行があるステータスはそのWorldのみで使用可能——旧`character_statuses.world_id`列（nullable、null=共通）による1行=1World限定方式は廃止（列自体は物理的に残るがアプリからは書き込まれない）。`CharacterStatusesPage.jsx`の「アタッチ済みWorld」セクションで管理する。

**脱衣状態の表現**：`character_statuses`の`exclusive_group`を以下4つの予約名として登録したステータス群を使い、既存の関係性ステージ（`exclusive_group`は任意の名前でよい）と同じ排他機構で、上半身/下半身×服/下着を**独立に**管理する（服は半脱ぎだが下着はまだ着衣、のような組み合わせも表現できる）：

| exclusive_group | 対象 |
|---|---|
| `undress_state_upper_clothing` | 上半身の服（ベース＋上着） |
| `undress_state_upper_underwear` | 上半身下着 |
| `undress_state_lower_clothing` | 下半身の服（ベース＋上着） |
| `undress_state_lower_underwear` | 下半身下着 |

- **LLMへの可視化**：アクティブな各トラックは`promptBuilder.js`（`undressState.js`の`getUndressStateLines`共通ロジック、`insertDialogue.js`の生成モードでも同じ関数を使用）のキャラクターカードに「現在の{トラック名}状態：{ステータス名}」として自動的に含まれる（LLMのシステムプロンプトに可視）。他のexclusive_groupファミリー（関係性ステージ等）はこの仕組みの対象外
- **表示側**：`buildStatusSnapshot`（`server/src/db/repositories/statusSnapshotRepo.js`）の`stages`配列に他のexclusive_groupファミリーと並んで含まれ、既存の「関係ステージ」表示トグルで一括制御される
- **画像生成タグへの反映**：`character_statuses`に`suppresses_outfit_fields`列（カンマ区切りの`OUTFIT_TAG_FIELDS`列名）を追加。このステータスがアクティブな間、対応する衣装タグ列を`resolveOutfitTags`（`outfitTagCategories.js`）の合成結果・`${targetN.category}`イベント/シーン画像生成プレースホルダーの両方から除外する（`generateImage.js`がアクティブな全ステータスの`suppresses_outfit_fields`を合算して渡す）。例：`clothing_upper_outer`列を抑制すれば「上着なし」段階で上着タグが画像生成に出力されなくなる
- **チャット行動コマンドとの連携**：既存の`action_commands`（`command_type: 'keyword'`）＋`event_definitions`（`keyword`条件＋`change_status`アクション、`character_id: "mentioned"`）の組み合わせで、新しい機構を追加せずに「脱がす」ボタンを実現する。行動コマンドのキーワード送信は@メンションを保持したまま送信される（`ChatPage.jsx`の`sendKeywordCommand`）必要があるため、下書き欄の内容とキーワードを結合してから送信する
- 現代学園ファンタジー（World4）に4トラック計14ステータス・対応する10個の行動コマンド／イベントを実コンテンツとして登録済み（各段階が「初期段階以外」の1つにつき1組、前方向へのみ進む——着直すボタンは用意していない）。持続範囲は`session`（部屋移動・再入室でリセット）

### action_commands（行動コマンド）の3段階カテゴリ + 表示条件
チャット入力欄上のコマンドバーが行動コマンドの増加で肥大化したため、`category`／`subcategory`／`sub_subcategory`（すべて自由記述TEXT、`0036_action_command_categories.sql`）を追加し、コマンドバーをPC98風のコマンド選択メニュー（カテゴリピル→クリックで展開→（該当すれば）サブカテゴリピル→個別コマンド）として表示する（`ChatPage.jsx`の`ActionCommandBar`）。`category`が空のコマンドは従来どおりフラット表示される（後方互換）。

- 現状の運用タクソノミー：トップレベル`category`は「はなす」「する」（いずれも他と独立、機能分類ではなくチャット主体の性質を優先）、それ以外は機能別に「しらべる」「もちもの」「脱衣」（World4限定、`subcategory`に「上半身」/「下半身」）。3段階を最初から用意してあるのは、将来「その他」枠（性的要素・戦闘行動などプロジェクト外で追加予定の要素）へ再分類する際にマイグレーション無しで対応するため
- **表示条件（`visible_when_status_ids`）**：カンマ区切りの`character_statuses.id`一覧。現在のセッション参加者の誰か1人でもそのいずれかのステータスを保持していれば表示する（any_present、未設定なら常に表示）。脱衣コマンドのうち下着系4つ（下着をずらす／脱がす×上半身/下半身）に、対応するクロージングトラックの「半脱ぎ」「服なし」ステータスidを設定し、服が半脱ぎ段階に達するまで下着コマンドが出現しないようにしている
- **表示条件（`visible_when_room_template_ids`、2026-07-20追加）**：カンマ区切りの`room_templates.id`一覧。現在の部屋がそのいずれかであれば表示する（any_present、未設定なら常に表示）。`visible_when_status_ids`と併用した場合はAND（両方の条件を満たす必要がある。各条件内部はOR）。`ChatPage.jsx`の`commandVisible`が`session.room_template_id`と照合する（サーバー側の追加取得は不要——既にセッションから取得済みの値を使う）
- `ActionCommandsPage.jsx`にカテゴリ入力・表示条件（キャラ状態／部屋）の複数選択チェックボックス・編集機能（従来は新規登録＋削除のみだった）を追加

### 「周辺」@メンション + 周辺確認モード
アドベンチャー的な「周辺を調べる」用途のため、チャット画面のメンションボタン列に、参加キャラとは無関係な固定の`@周辺`ボタンを追加している（`ChatPage.jsx`）。キャラの`@メンション`と同様、単に入力欄へ`@周辺`という文字列を挿入するだけで、キャラ解決の仕組み（`resolveMentions`）には一切乗らない。

サーバー側（`roomSessions.js`の`generateReply`）はプレイヤーのメッセージ本文に`@周辺`が含まれるかどうかだけを見て、そのターン限りの「周辺確認モード」フラグを`buildMultiCharacterMessages`/`buildSystemPrompt`（`promptBuilder.js`）に渡す。このモードのとき、システムプロンプトに以下の2点が追加される：

- **ITEM_GRANTのカテゴリ制限**：通常はそのWorldの全アイテムカテゴリ名をLLMに提示するが、周辺確認モード中は部屋テンプレートの`room_template_item_categories`（`roomItemCategoriesRepo.js`、`room_template_prop_categories`と同型の候補カテゴリテーブル）に設定されたカテゴリのみに絞る（部屋に何も設定されていなければ従来通り全カテゴリにフォールバック）。具体的なアイテム名は引き続きLLMがその場で自由に命名する（`findOrCreateWorldItem`）——固定アイテムリストからの選択ではない。
- **設備・物の発見指示**：この部屋にWorldが実際に配置しているProps（`world_room_props`/`world_room_free_props`、`worldRoomPropsRepo.js`）の一覧を、`[周辺確認モード]`ブロックとして提示し、NARRATIONやセリフでの発見・言及を促す。Propsは元々**画像生成タグ専用**で、通常のテキスト生成システムプロンプトには一切渡っていなかった（`promptBuilder.js`はpropsを参照していなかった）——この機能が、Propsをテキスト生成にも認識させる最初の経路になる。

部屋テンプレート編集画面（`RoomTemplateEditPage.jsx`）に「周辺確認で入手可能なアイテムカテゴリ」チェックボックス群を追加し、既存の「出現候補の設備・機材カテゴリ」と同じUIパターンで設定する。通常（`@周辺`を含まないメッセージ）のITEM_GRANT挙動は変更していない。

### 貨幣機能 + 買い物部屋
World単位で貨幣システムの有無・単位を設定できる（`worlds.currency_enabled`／`currency_unit`／`initial_money`、`WorldsPage.jsx`「貨幣設定」節）。`currency_enabled`のWorldでは、プレイスルー作成時（`createPlaythrough`）に`playthroughs.money`が`initial_money`で初期化される。

- **アイテムの価格**：`items.buy_price`／`sell_price`（どちらも省略可能なINTEGER）。`buy_price`が未設定のアイテムは買い物部屋でも販売不可、`sell_price`が未設定のアイテムは売却不可（`ItemsPage.jsx`で編集）。
- **買い物できる部屋（`room_templates.is_shop`）**：`is_place`と同型の部屋マスタ属性。`RoomTemplateEditPage.jsx`のチェックボックスで設定。「周辺確認で入手可能なアイテムカテゴリ」（`room_template_item_categories`）を、買い物部屋では商品カテゴリとしても再利用する（`買い物モード`のプロンプト＝周辺確認モードと同じ絞り込みロジックを共有、`promptBuilder.js`）。
- **購入フロー**：`is_shop`な部屋のセッションかつ`currency_enabled`なWorldでは、ITEM_GRANTの扱いが変わる（`roomSessions.js`の`handleParsedLine`）——`buy_price`が未設定のアイテム、または所持金が足りない場合は入手をブロックし、その旨のナレーションに置き換える（マイナス残高にはならない）。購入できた場合は`adjustMoney`で減算し、「購入した」ナレーション＋残高を表示、`money_changed`をブロードキャストする。
- **買い物モードのプロンプト**：`buildSystemPrompt`が`is_shop`＋`currency_enabled`のとき`[買い物モード]`ブロックを追加し、その部屋の候補カテゴリに属する価格設定済みアイテムを「商品リスト：名前（価格）」として提示、所持金も伝える。ITEM_GRANTのカテゴリ候補もその商品カテゴリに絞られる。
- **売却フロー**：`POST /room-sessions/:id/sell-item`（`item_id`指定）。`is_shop`＋`currency_enabled`＋対象アイテムに`sell_price`が設定されている場合のみ成立し、インベントリから減算・`adjustMoney`で加算・ナレーション作成・`money_changed`をブロードキャストする。チャット画面の「もちもの」パネル（`ItemCheckPanel`）は、買い物部屋にいる間のみ`sell_price`設定済みアイテムに「売る」ボタンを表示する。
- **所持金表示**：チャット画面の日付表示行（`ChatPage.jsx`、`{playthrough.current_day}日目 ...`の行）に、`currency_enabled`なWorldでは「／ 所持金 {money}{単位}」を追記する。`money_changed`は`message_complete`と同時にブロードキャストされるため、既存の`message_complete`受信時のクエリ無効化（`['playthroughs']`）に相乗りする形で表示が更新される。
- **現代学園ファンタジー（World4）の実コンテンツ**：`currency_enabled=1`／`単位=円`／初期所持金3000円。新規の買い物部屋3つ——購買部・売店（昇降口・正門前に接続、食べ物・飲み物＋文房具・日用品）、食堂（昇降口・正門前に接続、食べ物・飲み物）、雑貨屋・コンビニ（商店街・駅前通りに接続、食べ物・飲み物＋文房具・日用品）——と、価格設定済みアイテム10点（メロンパン等5点＋文房具・日用品5点）を登録済み。

### プライベート部屋（`suppress_auto_population`）+ 有料イベント + 商店街拡張（2026-07-20）
`room_templates.suppress_auto_population`（migration 0050）を立てた部屋は、`roomSessionsRepo.js`の`createRoomSession`がタグ一致自動出現・固定割り当て・行単位ランダムを一切呼び出さず、常に0人からスタートする。部屋移動時の同行キャラ引き継ぎ（`is_accompanying`）だけは無条件のまま機能するため、「同行中のキャラとだけ、他の誰にも邪魔されず話せる部屋」を実現できる（`RoomTemplateEditPage.jsx`のチェックボックスで設定）。

有料の「イチャコラ」イベントは、既存の`行動:イチャコラ誘う`/`行動:キスする`（World4、global scope）と同じ構造を、新規条件`has_money`と新規アクション`spend_money`を組み込んで`scope='room_template'`で複製したもの：
- **has_money**（条件）：`{ "comparison": ">=", "value": 5000 }`。`playthroughs.money`と比較（`comparison`は`relationship_threshold`と同じ演算子集合）
- **spend_money**（アクション）：`{ "amount": 5000 }`。`playthrough.money`から減算（マイナス残高にはならない——`has_money`がトリガー条件として先にガードしている前提）
- 誘いの`keyword`条件と`has_money`条件を両方トリガーに置き、成功時アクションの先頭で`spend_money`を実行、失敗時は課金なし（既存の「関係値未達で静かに発火しない」慣習と同様、資金不足時も専用のナレーションは出さずイベント自体が発火しない）

現代学園ファンタジー（World4）の商店街・駅前通りに追加したコンテンツ：
- **専属スタッフ4名**（モブではない）：食堂のお姉さん（食堂、昼・放課後に確定出現）、コンビニ店員1（大学生想定、雑貨屋・コンビニ、朝・昼）、コンビニ店員2（生徒想定、同、放課後・夜）、購買部のお姉さん（購買部・売店、朝〜放課後）。各部屋に新規slot＋`random_fill_mode='always'`の時間帯限定assignmentを追加し、既存の一般ランダム店員枠とは独立して確定出現させている
- **メイド喫茶**：部屋自体の`attribute_tags='メイド'`により、`メイド`タグを持つキャラ（メイド3名、10代）が時間帯を問わず自動在住
- **裏路地**：部屋自体の`attribute_tags`を`裏路地専用`という他の誰も持たないタグにして、World（`生徒,教師,小学生,中学生,家族`）の広いタグへのフォールバックを遮断——不良3名・ギャル3名だけが、放課後・夜限定の行単位ランダム枠（75%/50%/50%、最大3名）から抽選される。有料イベント「誘惑する」（5000円）→「口づけする」の専用action_commandsを追加
- **怪しいお店**（裏路地からのみ到達）：部屋自体の`attribute_tags='怪しい'`で、怪しいお姉さん3名（personality/notesに淫乱さを記述——`relationship_axes`の淫乱度軸自体はルート実データのためキャラ初期値の底上げはできず、テキスト表現のみ）が常時在住。有料イベント「口説く」（10000円）→「唇を重ねる」
- **ホテル**：部屋自体の`attribute_tags='ホテル受付'`で、受付のお姉さん2名が常時在住
- **ホテルの部屋**（ホテルからのみ到達）：`suppress_auto_population=1`のプライベート部屋。スロットなし、同行キャラのみが存在する

なお、`attribute_tags`が空の部屋はWorldの`attribute_tags`にフォールバックするため（上記「部屋入室時のデフォルト参加者決定」参照）、World側のタグが広い場合は新規の無人格部屋でも既存キャラが大量に自動出現しうる——裏路地で採用した「他の誰も持たないダミータグ」は、行単位ランダムのみで人口を制御したい部屋向けの一般的な回避策として使える。

### expression_types（表情マスター）
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| name | text | 通常／笑顔／怒り 等 |
| llm_tag_key | text | LLM出力の`[EMOTION:xxx]`と対応 |

### outfit_expression_images
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| outfit_id | FK | |
| expression_type_id | FK | |
| image_path | text | |

### relationship_axes（関係性軸マスター）
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| name | text | 好感度／信頼度／恋愛度／欲情度／依存度／淫乱度 等（ユーザー管理のマスターデータ） |
| min_value | int | |
| max_value | int | |
| default_value | int | |
| scope | text | `relationship`（対あなた）／`self_stat`（キャラ自身）。migration 0023 |
| regen_per_time_slot | int, nullable | 自己ステータスの時間経過での自然増減。migration 0023 |
| llm_auto_update_enabled | int(bool), 既定1 | 2026-07-20追加（migration 0056）。LLMによる状態値/関係値の自動増減（後述）の対象からこの軸を個別に除外できる |

### character_relationship_defaults
| カラム | 型 | 備考 |
|---|---|---|
| character_id | FK | |
| relationship_axis_id | FK | |
| initial_value | int | |

### relationship_states（ルート実データ、2026-07-17拡張）
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | surrogate key（0041で複合PKから移行） |
| playthrough_id | FK, nullable | 通常キャラはこちらでルート単位に永続 |
| room_session_id | FK, nullable | モブキャラ（`characters.is_mob`）はこちらで部屋セッション単位にスコープ（永続しない） |
| room_session_character_id | FK, nullable | 2026-07-19追加（migration 0045）。同一モブが同一セッションに複数インスタンス（`room_session_characters`の別行）として重複参加している場合、インスタンスごとに関係値を分離する。非モブは常にNULL |
| character_id | FK | |
| relationship_axis_id | FK | |
| current_value | int | |

**モブキャラ（`characters.is_mob`、migration 0041）**：同じ`character_id`が複数の部屋セッションで同時に「別人」として使われうる（例：複数の部屋に別々の「モブ・小学生」が同時出現）ため、`relationship_states`・`character_address_states`（呼び方）はどちらも`room_session_id`スコープで書き込まれ、そのセッションが終われば値は参照されなくなる（`playthrough_id`は常にNULL）。判定は`relationshipStatesRepo.js`/`characterAddressStatesRepo.js`内の`scopeColumns()`が`charactersRepo.js`の`isMobCharacter()`を見て自動的に切り替える——呼び出し元は常に`playthroughId`と`roomSessionId`の両方を渡すだけでよい。`character_status_states`（関係ステージ等）は既存の`persistence_scope`（`session`/`accompanying`）をそのステータス定義側で選べば同様にセッションごとリセットされる（モブ用に別途コード変更は不要）。自己ステータスの時間経過による自然回復（`playthroughsRepo.js`の`applySelfStatRegen`）はモブキャラには適用されない（`playthrough_id`スコープの行のみを対象にしているため、意図的な仕様簡略化）。

**同一モブの重複インスタンス分離（2026-07-19、migration 0045）**：`room_session_character_id`（3テーブルとも追加）により、同じモブが同一セッションに複数インスタンスとして参加している場合でも各インスタンスが独立した関係値・呼び方・ステータスを持てる（従来は共有されていた——[[room_slot_row_level_random_and_mob_duplication]]の既知の制約を解消）。`ensureRelationshipStatesSeeded`（`roomSessionsRepo.js`）はインスタンス単位でシード判定するよう修正済み。イベントアクション（`change_relationship`/`set_address`/`change_status`）は対象解決時に`{character_id, instance_id}`ペアを扱う：`all_present`は各インスタンスへ個別適用、`mentioned`/固定指定は`execCtx.instanceHintByCharacterId`（明示的@mention優先、無ければそのターンで最後に発言したインスタンスにフォールバック）から解決する。

### event_definitions
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| name | text | |
| scope | text | global / room_template |
| room_template_id | FK, nullable | scope=room_templateの場合 |
| enabled | bool | |
| condition_logic | text | AND / OR（複数条件の結合方法） |
| priority | int | 同一tickで複数該当した場合の実行順 |
| cooldown_turns | int | 連発防止 |
| max_fires_per_session | int, nullable | セッション内の最大発火回数（null=無制限） |
| exclusive_group | text, nullable | 同グループ内は排他発火（優先度が高い方のみ） |

### event_conditions
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| event_definition_id | FK | |
| condition_type | text | probability / turn_count / keyword / relationship_threshold / flag_state / participant_count / has_item / llm_judge / has_status / has_outfit / has_money |
| params | json | 種別ごとのパラメータ |

### event_actions
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| event_definition_id | FK | |
| action_type | text | character_join / character_leave / insert_dialogue / generate_image / set_flag / change_relationship / change_outfit / advance_time / grant_item / remove_item / change_status / set_address / spend_money / set_scene_situation / grant_random_item |
| params | json | 種別ごとのパラメータ |

**grant_random_item** - 重み付きランダムなアイテム付与（2026-07-21追加、migration 0057）
```json
{ "pool": [{ "item_id": 26, "weight": 60 }, { "item_id": 27, "weight": 30 }, { "item_id": 28, "weight": 10 }], "quantity": 1 }
```
- `pool`：`{item_id, weight}`の配列。重みの合計に対する比率で1件を抽選する（キャラ参加抽選の`pickWeighted`と同じアルゴリズム）
- `quantity`：付与個数（省略時1）
- `grant_item`は固定の1アイテムしか付与できないのに対し、こちらは「同じ行動でも結果が毎回変わりうる」アイテム入手（釣り・採掘・宝箱など）を1アクションで表現できる

**アイテム使用契機のアイテム入手パターン（釣りの例）**：`action_commands`の`item_use`タイプは元々プレイヤーが手持ちアイテムを自由に選んで「使う」ボタンを押すと固定の地の文（例：「『釣り竿』を釣りをする」）を送信するだけの汎用UIで、サーバー側はどのコマンドが押されたかを認識しない（`consumes_item`/`transfers_to_target`はクライアント側のみで解釈）。そのため「特定アイテムを使うと確率で別アイテムが手に入る」仕組みは、新規サーバーコードなしに既存のイベントエンジン条件・アクションの組み合わせだけで実現できる：
- 行動コマンド（`item_use`、`consumes_item=false`＝道具は消費しない、`visible_when_room_template_ids`で対象部屋にのみ表示）
- イベント：`keyword`（送信文に固定フレーズが含まれるか、trigger）＋`has_item`（対象の道具を所持しているか、trigger）＋`probability`（釣れる確率、outcome）＋`has_outcome_branch=true`
- 成功時アクション：`grant_random_item`（釣れるアイテムの重み付きプール）＋任意で`insert_dialogue`
- 失敗時アクション：`insert_dialogue`のみ（何も得られなかった旨のナレーション）
- 部屋を横断させたい場合（川・海など複数部屋で同じ内容にしたい場合）は、`event_definitions.room_template_id`が単一FKのため部屋ごとにイベントを複製する（2026-07-21時点の判断：複数部屋をまとめるための新規スコープ概念は未実装）

World4の実例（`server/src/db/repositories/`経由で投入済み）：`釣り竿`（運動用品・レジャー用品カテゴリ、雑貨屋・コンビニで購入可）を持って河川敷の土手／海岸で「釣りをする」を実行すると、60%の確率で鮒／30%で鯉／10%で幻の巨大魚（新設`魚介`カテゴリ）のいずれかを入手する。同じ`keyword`＋`has_item`＋`probability`＋`grant_random_item`のパターンは、採掘・金属探知など他の「道具を使って確率でアイテムを得る」コンテンツにもそのまま流用できる。

### session_flags（イベント連鎖用フラグ、ルート単位・グローバル共有）
| カラム | 型 | 備考 |
|---|---|---|
| playthrough_id | FK | 部屋をまたいでも共有されるルート単位のデータ |
| flag_key | text | |
| flag_value | text | |
| set_at_turn | int, nullable | フラグ設定時のルート内累計ターン番号。`turn_count`条件の`reference: "flag_set"`が経過ターン数を計算するために使用（実装フェーズで追加） |

### character_flags（イベント連鎖用フラグ、キャラ別）
`session_flags`とは独立の名前空間 — `flag_state`/`set_flag`に`character_id`を指定した場合のみ使われる（未指定時は従来通り`session_flags`を使用）。`character_status_states`の`persistence_scope`二層化と同じ排他キー方式（`persistence_scope`に応じてplaythrough_id/room_session_idのどちらか一方だけを使用）。
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| character_id | FK | |
| flag_key | text | |
| flag_value | text | |
| persistence_scope | text | `"playthrough"`（ルート永続）/ `"session"`（セッション内一時。部屋移動で参照不能になる） |
| playthrough_id | FK, nullable | persistence_scope="playthrough"時のみセット |
| room_session_id | FK, nullable | persistence_scope="session"時のみセット |
| set_at_turn | int, nullable | |

### event_fire_history（イベント発火履歴）
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| playthrough_id | FK | |
| room_session_id | FK, nullable | 発火時の部屋滞在（2026-07-17、migration 0037で追加。`recordFire`は常に記録するが、参照は`reset_scope`次第） |
| event_definition_id | FK | |
| fired_at_turn | int | 発火時のターン番号（ルート内累計） |
| fired_at | datetime | |

`cooldown_turns`／`max_fires_per_session`／`turn_count`条件の`reference: "last_fire_of_this_event"`は、いずれもイベントの過去の発火履歴を参照する必要があるため、実装フェーズでこのテーブルを追加した。関係性・フラグ・発火履歴をルート単位にまとめたことで、部屋を移動してもこれらの状態は引き継がれる。

**リセット範囲（2026-07-17）**：`event_definitions`に`reset_scope`／`prerequisite_reset_scope`（いずれも"playthrough"（デフォルト）\|"session"）を追加し、以下2つの判定を独立に「ルート全体累計」か「部屋滞在単位でリセット」か選べるようにした：
- `reset_scope`：このイベント自身の`cooldown_turns`／`max_fires_per_session`判定
- `prerequisite_reset_scope`：`prerequisite_event_definition_id`が「前提イベントが発火済みか」を判定する際のスコープ。**要求側イベント自身の設定**が使われる（前提イベント自身の`reset_scope`とは独立）——「イチャイチャする」→「キスする」のような段階式イベントを、ルート全体で一度成立すれば継続させるのではなく、部屋を移動すると前提の成立状態がリセットされ、再度イチャイチャする必要がある形にできる。

### messages
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| room_session_id | FK | |
| sender_type | text | user / character / narration / system |
| character_id | FK, nullable | |
| content_type | text | text / image |
| content | text, nullable | content_type=textの場合の本文 |
| image_id | FK, nullable | content_type=imageの場合、generated_imagesを参照。タイムライン内に画像を割り込み挿入するために使用 |
| emotion_tag | text, nullable | |
| created_at | datetime | |

**空メッセージ・@メンションのみ送信＝続き生成**：`POST /room-sessions/:id/messages`は、送信内容が空、または@メンショントークン（`@キャラ名`／`@周辺`）を全て取り除いた残りが空文字（trim後）の場合、実際のユーザーターンとしては扱わない（`messages`行を作成しない）——LLMへは直前の自分の応答の続きを生成させるだけの一時的な空白ターンを渡す（2026-07-20拡張：以前は完全な空文字のみが対象で、`@みお`のようなメンションのみの送信は通常のユーザーターンとして永続化されていた）。含まれていたメンションは（続き生成と判定された場合）一切使われず、`@周辺`のみの送信は周辺確認モードの指示だけが有効な「続き生成」になる。

### generated_images
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| room_session_id | FK | |
| type | text | face / scene / event |
| character_id | FK, nullable | |
| prompt | text | |
| file_path | text | |
| created_at | datetime | |

### image_style_presets（画像スタイルプリセット、3.7）
| カラム | 型 | 備考 |
|---|---|---|
| id | PK | |
| name | text | |
| prompt_text | text | 画風・品質タグ・アーティスト名など。全生成呼び出しのプロンプト先頭に付加 |
| is_default | bool | 常にちょうど1件がtrue。既定のプリセットは削除不可 |

### image_format_settings（画像種別ごとの出力形式、3.7）
| カラム | 型 | 備考 |
|---|---|---|
| image_kind | PK, text | standing / expression / scene / event |
| format | text | png / jpg |

### image_generation_settings（画像種別ごとの生成方式・プロンプトテンプレート、3.7）
| カラム | 型 | 備考 |
|---|---|---|
| image_kind | PK, text | standing / expression / scene / event / room_background / world_thumbnail |
| default_mode | text | `anchor_i2i` / `prompt_only`（3.7参照） |
| prompt_template | text | `${変数名}`形式のプレースホルダーを含むテンプレート文字列。種別ごとに使える変数が固定されている |
| anchor_width | int | 参照アンカー領域の幅（px）。i2i用 |
| main_width | int | 出力する本編領域の幅（px） |
| main_height | int | 出力する本編領域の高さ（px） |
| steps | int | SDのサンプリングステップ数 |
| cfg_scale | real | SDのCFGスケール |
| denoising_strength | real | i2i時のノイズ除去強度（0〜1） |
| sampler_name | text | KoboldCppのサンプラー名（例：`Euler a`, `DPM++ 2M`） |
