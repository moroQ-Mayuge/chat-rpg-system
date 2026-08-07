# 不具合報告・追加要望 調査メモ（2026-08-06）

衣装関連リワーク第10段（既存データ整理）の前に、ユーザーからのプレイテスト報告5件を記録・順次調査。[[feedback_bugreport_recording_workflow]]（記録優先、対応方針は都度相談）に沿って進行中。**この文書は調査ログであり、まだどの項目も修正していない。**

原文の記録は `~/.claude/projects/.../memory/bugreports_2026-08-06.md` にもあり（内容は同一）。こちらはロスト防止のためリポジトリに残す控え。

---

## 1. イベントの`${player}`が、よく別の`@キャラ`に置き換わる

**状態: 調査完了、原因を概ね特定。対応方針は未定（ユーザー判断待ち）。**

- `${player}`自体の解決（`server/src/services/eventEngine/placeholderResolution.js`の`resolveGlobalToken`）は`base === 'player'`なら必ず`playthrough.protagonist_name`（未設定なら「あなた」）を返す作りで、`@キャラ`名との文字列的な衝突は起きない。プレイヤーは`characters`/`room_session_characters`に行を持たない（`worlds`/`playthroughs`の自由記述列のみ）ため、`@`メンションスキャン（`resolveMentions()`）の対象にも構造的に入らない。
- **本命（ユーザー確認済み: 生成モードで発生）**: `insertDialogue.js`の`generateNarrationLine()`が組み立てるLLM向けシステムプロンプトが「実在の人物名は登場人物一覧の中からのみ使うこと」と指示するが、その一覧（`presentParticipantsLine()`）は**部屋の参加者のみでプレイヤーを含まない**。`${player}`は指示文中で先にプレイヤー実名へ置換済みのため、「その名前は許可リストに無い」という矛盾状態でLLMに書かせており、モデルが許可リストにある別`@キャラ`名で代用してしまう、という筋。固定文（`mode: "fixed"`）や`set_scene_situation`では起きないはず。
- 副次的に2件確認:
  - `${player.属性}`が未実装（`EventsPage.jsx`のヘルプ文言では`${target1.属性}`同様のサフィックスが使える説明だが、`resolveGlobalToken`は属性を一切見ずに素の名前を返すのみ）
  - `llm_judge`の`${target1}`が、`per_character_firing`イベントで`@`メンションが無いターンだと`matchedCharacterIds`未設定によりただの参加者配列先頭にフォールバックする、再現性のある別バグ（`${player}`とは別件、`${target1}`使用時のみ影響）

**対応方針（案、未決定）**: `presentParticipantsLine()`にプレイヤー名も一覧に含める。

---

## 2. プリキュア/セーラームーン型「変身」キャラ機構の追加

**状態: 実現可能性調査完了。設計方針は未定（ユーザー判断待ち）。**

要望: 好感度・基本ステータスは変身前のキャラと共有、呼び名・見た目・技能は別キャラとして定義。変身イベントや「変身のお願い」でキャラを差し替えるイメージ。

- **最大の構造的な壁**: 変身後を**別の`characters`行**として作る素直な設計だと、`relationship_states`/`character_status_states`/`character_address_states`は全て`character_id`で一意に紐づいており、「別のcharacter_idと状態を共有する」仕組みがコードベースのどこにも存在しない。近い前例（モブの`room_session_character_id`スコープ分割）はあるが、方向が逆（1→多の分割であり、2→1の統合ではない）で転用不可。
- `character_id`を実行時に差し替える設計にした場合も、`messages`（発言者id）・`generated_images`・イベント条件の対象解決（`resolveTargetIds`）が全て`character_id`を「参加者の恒久的な身元」として前提にしており、変身後にイベント条件が一致しなくなる等の副作用がある。
- 変身専用の行動コマンド／イベントアクション（「参加者が指すcharacter_idを差し替える」もの）は現状存在しない。最も近いUX前例は今回追加した「着る」（`item_wear`、`POST /:id/wear-item`）——プレイヤー起点で特定キャラの見た目を即座に変える、という導線の形は流用できそう。

**推奨候補（対応方針、未決定）**: character_idを分けず、**衣装マスタと同じ発想**（`outfit_masters`のマスタ定義＋`current_outfit_id`のセッション/ルート単位持続＋`composeWornOutfit`合成層）を、衣装だけでなく名前・見た目・技能にも拡張する形。character_idが変わらないため「好感度・基本ステータス共有」は自動的に満たされ、イベント条件・チャットログ・関係値への副作用もゼロ。実装順3〜8の資産をほぼ転用できる。

**実装状況**: この方針で着手済み。4段階に分割し、**第1〜3段は2026-08-08に実装・検証・コミット済み**（第1段: `character_transformations`テーブル、`current_transformation_id`／`playthrough_character_transformation`、`composeCharacterIdentity()`、`attachParticipants()`/`promptBuilder.js`/`insertDialogue.js`への差し込み、コミット`5a5c59a`。第2段: `updateParticipantTransformation`、`executeTransformCharacter`（対象キャラ以外の変身定義は`transformation_not_owned`で安全に無視）、`character-transformations`系REST API新設、`EventsPage.jsx`に「変身」アクションUI追加、コミット`dce2163`。第3段: `action_commands.command_type`に`transform_request`追加（migration 0094、テーブル再構築）、`POST /room-sessions/:id/transform-request`、`ChatPage.jsx`に`TransformRequestPanel`（対象NPC→そのNPC自身の変身先を選ぶ2段階UI）、`ActionCommandsPage.jsx`に「変身のお願い」ラベル追加、コミット`b00090c`）。まだ変身定義の編集UI（第4段、`CharactersPage.jsx`）は無い——API直叩きでのみ変身定義を作成可能。残り1段（第4段）は未着手、順次実施中。

---

## 3. 部屋アイテムが場面をまたいでリセットされない／売店以外は毎セッション初期出現させたい

**状態: 調査完了。結論＝(a)仕様通りの永続動作（バグではなく要望）。対応方針は未定（ユーザー判断待ち）。**

- `playthrough_room_available_items`／`playthrough_room_discoveries`は共に`(playthrough_id, room_template_id)`単位（`room_session_id`列自体が存在しない）。マイグレーション`0072_room_item_discovery.sql`のコメントに「抽選は発見時の1度きりで、以降その顔ぶれが常設される」と明記——**これは意図した恒久仕様**。`room_session_picked_items`（`0071`、`room_session_id`キー）だけがセッション毎にリセットされる設計で、これは「一度拾った物がまた拾えるようになる」ためのテーブルであり、「そもそも部屋に何があるか」はリセットしない。
- `itemDiscovery.js`の`stockRoomIfUndiscovered`は`isRoomDiscovered`で「そのルートでそのroom_templateが初探索済みか」を確認し、済みなら即return——2回目以降の入室では3〜5件の初期抽選自体が最初から走らない。「リセットされない」のはバグでなく仕様通りの動作。
- **売店（`is_shop`）は構造的に完全に別系統**：`promptBuilder.js`が`room_template_item_categories`＋`buy_price`付き商品を**毎ターン再計算**して見せているだけで、`playthrough_room_available_items`等を一切読み書きしない。つまり「売店を除いて」の除外は現状のアーキテクチャ上すでに自動的に成立している——売店側は今回の要望に対して特別扱いする必要が無い。
- `createRoomSession`（新規セッション作成時）を含め、コードベース全体で`playthrough_room_available_items`/`playthrough_room_discoveries`への`DELETE`は1件も存在しない。「リセット処理が壊れている」のではなく「そもそも実装されていない」。
- `grant_random_item`イベントアクションはプレイヤーの所持品に直接付与するのみで部屋の在庫状態には一切触れない（混同の原因ではない）。一方、非売店での`[ITEM_GRANT]`（LLMのアイテム付与タグ）は`makeItemAvailable`経由で部屋に置くだけで即座に所持品には入らない（拾う操作が必要）——これは仕様上の体験（「渡されたのに持ってない」という戸惑い）であり、部屋/セッションの取り違えではない。

**対応方針（案、未決定）**: リセット機構自体が存在しないため、新規に「セッション毎に`playthrough_room_available_items`/`playthrough_room_discoveries`を再抽選/クリアする」仕組みを追加する必要がある。`is_shop`/`suppress_auto_population`と同様の`room_templates`側フラグ（例：`reset_items_per_session`的な列）で部屋ごとにON/OFFする形が既存パターンと整合的。

---

## 4. 子供キャラ生成時にほとんどの要素が埋まっていない／親からの引き継ぎ表現を微妙に変えたい

**状態: 調査完了、原因特定済み。対応方針は未定（ユーザー判断待ち）。**

- 子キャラ生成の実体は`childCharacter.js`の`materializeChild(pregnancyId)`（プレイヤーが「起こす」ボタンを押した時のみ発火、`end_pregnancy`/`time_skip`アクション自体はキャラを作らない）。`createCharacter`が持つ36個のテキスト列のうち、**実際に値が入るのは11個のみ、残り25個が空文字のまま**——これが「ほとんどの要素が埋まっていない」の直接原因。
  - 埋まる: `name`（`child_name`指定 or 自動生成）, `gender`（**常に固定文字列`'少女'`**）, `age_real`/`age_apparent`, `race`/`attribute`/`eye_description`/`hair_description`（母から継承）, `attribute_tags`, `call_user_as`, `notes`
  - 空のまま: `full_name`, `full_name_reading`, `nickname`, `occupation`, `appearance_features`, `body_type`, `bust_description`, `physical_features`, `main_features`, `hairstyle`, `first_person`, `call_others_as`, `personality`, `speech_style`, `sentence_ending`, `behavior_principle`, `social_tendency`, `habits`, `likes`, `dislikes`, `skills`, `special_skills`, `weakness`, `secret`, `underwear_preference_tags`（特に`personality`/`first_person`/`speech_style`/`appearance_features`等、プレイ上必須の項目が軒並み空）
  - `createCharacter`自体に隠れた例外や不具合は無く、単に呼び出し元（`materializeChild`）がほとんどのフィールドを渡していないだけ（`?? ''`の素直な既定値化）
- **既存の継承ロジック**は`INHERITED_FIELDS = ['race', 'attribute', 'eye_description', 'hair_description']`の4つのみ、母の値をそのままコピー（表現の変更は一切無し）。`character_pregnancies.partner`は自由記述で父キャラの実体を持たないため、父側からの継承は構造的に存在しない。属性タグだけは別途、World設定（固定/ランダム/母から50%継承）による多少凝った仕組みがあるが、これはタグ用でフリーテキストの性格・外見等には使えない。
- **副次発見**: `end_pregnancy`アクションの`child_gender`パラメータは**完全に無視**されており、`gender`は常に`'少女'`固定（コード内コメントでも「今のところ未使用」と明記、既知の制約として`PLAN_2026-07-28_pregnancy_children_deviation.md`にも記載あり）。要望に無かったが同根の欠落として報告。
- **「表現を微妙に変える」に転用できる既存資材あり**: `characterAssist.js`の`regenerateField({field, instruction, currentFields})`——既存フィールド値を文脈として渡し、LLMで1フィールドだけ再生成する仕組み（`CharactersPage.jsx`の「この項目だけをLLMで再生成」機能の裏側）。母の値を`currentFields`に渡し「子供らしく少し表現を変えて」等の指示で呼べば、新規のプロンプト基盤を作らずに転用できそう。現状`materializeChild`はLLM呼び出しを一切せず、全て同期的な文字列コピー/固定文/ランダムタグ選択のみ。

**対応方針（案、未決定）**: (1) 空のままの25フィールドのうち、キャラとして最低限必要なもの（`personality`/`first_person`/`speech_style`/`appearance_features`等）を埋める方法を検討——`regenerateField`をmaterializeChild内から呼ぶLLM生成 or 追加の継承ルールのどちらか/併用。(2) `child_gender`の未使用も合わせて直すか要確認。

---

## 5. 母親の名前の洋風/和風判定と子への引き継ぎ、フルネーム表記ルール整理

**状態: 調査完了。実データからは判定基準を検証できないことが判明。対応方針は未定（ユーザー判断待ち）。**

- `full_name`/`full_name_reading`は完全自由記述で、フォーマット強制・区切り解析は一切存在しない。近い前例は`childName.js`の`familyNameOf`（`full_name`を空白で分割し先頭を姓として使う、2トークン未満なら諦めて空文字）のみ——これは「洋風/和風の判定」ではなく単なる空白分割。「・」を区切りとして解析するコードはリポジトリのどこにもゼロ件（実データにも「・」を含む名前は1件も無い）。
- 母の名前情報（`full_name`/`full_name_reading`含む）は子生成時に構造的にアクセス可能——`materializeChild`が既に`mother`オブジェクト全体を持っている。既存の`worlds.child_name_style`（`'和名'|'洋名'`）はWorld単位の固定設定であり、母の実際の名前から動的判定しているわけではない——ここがまさに要望のギャップ。
- **実データを直接確認**（`data/chatrpg.sqlite`、51件の非モブキャラ）: **全件が日本語名・半角スペース区切り**（例：`桜井 澪`）、ラテン文字を含む名前は0件、「・」を含む名前も0件。`full_name_reading`はほぼ全件でカナ・スペース区切り（姓読み↔名読みが対応）だが、2件（id3, id158）は`full_name`と`full_name_reading`のスペース有無が食い違う例外あり、1件（id159）は`full_name_reading`が空欄。`worlds.child_name_style`は全7件が既定の`'和名'`のまま、`洋名`設定は実運用で一度も選ばれていない。**`is_auto_created=1`のキャラ（子生成の実績）も現状0件**——洋風名のテストデータが実質存在しないため、判定ロジックの検証材料が無い状態。
- LLMベースの単発判定の前例としては`llmJudge.js`（イベント条件のYes/No判定、`temperature: 0.05`, `maxTokens: 10`, エラー時false）が構造的に近い（そのまま流用はできないが型は既にある）。`characterAssist.js`の`regenerateField`は`full_name`のフィールド一覧には対応済みだが`full_name_reading`は未対応（LLM生成/貼り付け解析どちらにも存在しない、フォーム手入力のみの項目）。

**対応方針（案、未決定）**: 実データが和名・スペース区切りに偏っているため、まずは正規表現ベースの簡易判定（例：`full_name`にラテン文字が含まれる／スペース区切りで各トークンがローマ字、等）で足りるか、LLM判定（`llmJudge`型）まで要るか要相談——ユーザー要望通り「名前で使われそうな区切りパターン」も合わせて相談が必要。

---

## 全体まとめ（5件すべて調査完了）

| # | 内容 | 分類 | 状態 |
|---|---|---|---|
| 1 | `${player}`が別`@キャラ`に置き換わる | バグ | 原因特定（生成モードのプロンプトにプレイヤーが許可リストから漏れている） |
| 2 | 変身キャラ機構の追加 | 新機能 | **実装中**（4段階に分割、第1〜3段完了・コミット済み。残り1段（編集UI）は未着手） |
| 3 | 部屋アイテムが場面をまたいでリセットされない | 仕様通り（バグではない） | 恒久仕様と判明、リセット機構自体が未実装（新規追加が必要） |
| 4 | 子供キャラ生成時に要素がほぼ空 | バグ | 原因特定（36フィールド中25が未設定、継承ロジックも4フィールドのみ）。副次的に`child_gender`未使用も発覚 |
| 5 | 母の名前の洋風/和風判定・表記ルール整理 | 新機能 | 実データ検証済みだが洋風名の実例が無く判定基準は要相談 |

全項目、まだ実装・修正には着手していません。次は対応方針の検討（どれから着手するか、実装順の決定）に進めます。
