# 衣装関連 新仕様・UI・既存キャラ紐付け変更　検討メモ

2026-08-02 開始。v0.2.x（[ROADMAP.md](ROADMAP.md)参照）のメインテーマ。
2章以降が現状調査と方針案。**未実装・未確定**。

対象範囲（ユーザー宣言）:
- 衣装関連の新規仕様
- 衣装関連のUI
- 既存キャラクター情報に対する紐付けの変更

---

## 1. 記録（ユーザー要望・原文ベース）

1. 衣装マスタとそのUIを新設
2. 衣装マスタにて登録した衣装情報をキャラ側に取り込めるようにする。既存の衣装機能に準じた完全取り込み（キャラ情報側に衣装内容を持たせる）と、衣装マスタを参照するだけの2通りを用意する。このため衣装以外のキャラ共通のダンボールタグ情報を指定するUIが新規に必要になる？（要検討・ユーザー自身も疑問形）
3. 衣装自体をアイテムのように所持・受け渡しできるようにしたい。想定シチュエーション例：好みの衣装をプレゼントし、次のデートに着てきてもらう
4. イベントにて、衣装マスタであらかじめ作成しておいた衣装を該当キャラ（あるいはランダム。この指定方法は既存イベントの仕組み（対象指定）をそのまま使う予定）に着せた状態にできるようにする。想定シチュエーション例：文化祭イベント内で「メイド喫茶をやろう」のような、衣装も連動するイベントに使用したい
5. 衣装定義のアイテム化利用（項目3）を想定し、アイテムの購入と同様に、部屋にて発見または購入可能な衣装を指定できるようにする。衣装の属性キーや衣装のカテゴリなどで指定できるようにしたい
6. 衣装枠として別途「下着」の定義をある程度ランダムに持たせたい。現代世界観ベースでは毎日同じ下着というのは違和感があるため、World側で日付が変わったら、衣装マスタの下着専用枠？で定義されたものの中からランダム、またはキャラごとの好み属性キーを指定しておいてそれに該当する下着を抽選で装備させる、という形にしたい。この機構自体はWorldごとにOn/OFFできるようにする

---

## 2. 現状仕様（調査結果）

### 2.1 `outfits` テーブル＝「キャラ×衣装」であって衣装そのものではない

```
outfits (0001_init.sql:103)
  character_id  → characters(id) ON DELETE CASCADE   ← NOT NULL。所有者が必ず居る
  name, clothing_description, equipment_description
  standing_image_path, is_default
  garment_operations (0065, JSON)
  ＋ ダンボールタグ19列（0028で13列化 → 0033で19列に拡張）
```

19列の内訳（`outfitsRepo.js` の `OUTFIT_TAG_FIELDS`、順序が意味を持つ）:

| 群 | 列 | 本来の帰属 |
|---|---|---|
| 素体 | `main_features` / `hairstyle` | **キャラクター**（衣装ではない） |
| 中衣ベース | `clothing_main` / `_face` / `_upper` / `_lower` / `_legs` / `shoes` | 衣装 |
| 上着 | `clothing_{face,upper,lower,legs}_outer` | 衣装 |
| 追加装備 | `clothing_{face,upper,lower,legs}_equipment` | 衣装 |
| 下着 | `underwear_upper` / `underwear_lower` | 衣装（要望6は独立枠にしたい） |
| 持ち物 | `belongings` | どちらとも言える |

### 2.2 実データが示す重複と破綻（開発DB `data/chatrpg.sqlite` 実測）

- キャラ48人に対し衣装93件。うち**71件が5つの名前の繰り返し**（水着17／通常16／私服15／夏服13／通常（制服）10）
- 同名衣装の衣服タグは実際に同一。例：`clothing_main="school_uniform"` + `clothing_upper="shirt, long_sleeves, red_neckbow, white dress shirt"` が一ノ瀬かえでと桜井あかりで完全一致 → **マスタ化すれば消せる重複が現に存在する**
- 一方、`main_features`/`hairstyle` はキャラ固有の内容が全衣装行にコピーされている。しかも**衣装を2着以上持つ17人中16人で `main_features` が衣装ごとに食い違う**（`hairstyle` は15人）。原因は素体タグの置き場が無いこと:
  - 藤崎先生の「通常（制服）」は `main_features` に `formal_attire, jacket, tight_skirt`（＝衣服）が混入し、`hairstyle` は空で `long_hair` が `main_features` 側にある
  - 一ノ瀬かえでは `hairstyle="black_hair, long_hair"`、桜井あかりは `hairstyle="brown_hair, ..."` と髪色が `hairstyle` 側。他キャラは `main_features` 側に髪色
  - → **要望2の「キャラ共通タグUIが必要か？」は、必要かどうかではなく既に破綻していて是正が要る、が答え**

### 2.3 画像は衣装行に紐づく

- `outfits.standing_image_path`（実測44件）
- `outfit_expression_images (outfit_id, expression_type_id)`（実測352件）
- 生成時のファイル名も `outfit{id}-standing` / `outfit{id}-{expr}`（`outfitImageGenerator.js`）
- `roomSessionsRepo.js` の `listExpressionImagesWithFallback` は、表情画像が欠けている衣装を**同キャラの `is_default` 衣装**で埋める。`SELECT id FROM outfits WHERE character_id = ? AND is_default = 1` を直に撃っている

### 2.4 着用状態の持ち方

- `room_session_characters.current_outfit_id` — **部屋セッション単位**
- 新セッション作成時（`roomSessionsRepo.js:325`）: `carryOver?.current_outfit_id ?? defaultOutfit?.id ?? null`
- → **同行していないキャラは、部屋を移るたびに既定衣装に戻る**
- `change_outfit` アクション（`actions/changeOutfit.js`）は `outfit_id` を受け取り `updateParticipantOutfit` を呼ぶだけ

### 2.5 脱衣ラダー（衣装に強く依存）

- `character_statuses.suppresses_outfit_fields` / `disturbs_outfit_field` / `disturbance_style` / `disturbs_torn` が **`OUTFIT_TAG_FIELDS` の列名を文字列で参照**
- `outfitTagCategories.js` が合成の中心。`resolveOutfitTags(outfit, key, suppressed, disturbed, torn, settings)` は**フラットな19列オブジェクト1個**を受け取る前提
- `isUnderwearRevealed` は上着→中衣→下着の重ね順を**同一 outfit オブジェクト内**で辿る。`computeNudityTags` も同様
- `garment_operations` は「この衣装のこの部位に開く/たくし上げるが視覚的に成立するか」を持つ ＝ **衣服の性質**であってキャラの性質ではない

### 2.6 アイテム側（要望3・5の再利用先）

| 機能 | 実体 |
|---|---|
| マスタ | `items(world_id NULL=共通 / 値=World固有, category_id, buy_price, sell_price, image_tags)` |
| カテゴリ | `item_categories(world_id, name, is_consumable)` |
| 所持 | `playthrough_inventory(playthrough_id, item_id, owner_character_id, quantity)` — **ルート単位・NPC所持も既に可能** |
| 受け渡し | `inventoryRepo.transferItem()` — プレイヤー→NPC の「渡す」実装済み |
| 部屋での発見 | `room_template_item_categories` → `itemDiscovery.js` が初回探索時に**カテゴリ駆動で3〜5件抽選**して常設化、以降1回1件ずつ公開 |
| 購入 | `worlds.currency_enabled` + `room_templates.is_shop` + `items.buy_price` |
| イベント | `grant_item` / `remove_item` / `grant_random_item`（重み付き）/ `make_item_available` / 条件 `has_item` |

衣装側には**カテゴリも属性キーも価格も所持概念も無い**。

### 2.7 日付切り替わりフック（要望6の接続先）

`playthroughsRepo.advanceTime()` に `if (day !== playthrough.current_day)` の分岐が既にあり、そこで `syncDerivedCharacterFlags` を呼んでいる。`timeSkip.js` 経由の跳躍も同じ扱いが要る。

---

## 3. 衝突・矛盾の一覧

| # | 衝突 | 要望 | 深刻度 |
|---|---|---|---|
| C1 | `outfits.character_id` が NOT NULL。衣装はキャラの所有物であり、共有される概念が存在しない | 1,2,3,4,5 | **最大**。すべての土台 |
| C2 | `main_features`/`hairstyle`（素体タグ）が衣装行にあり、キャラ側に置き場が無い。実データも既に不整合 | 2 | **大**。マスタ化の前提条件 |
| C3 | 立ち絵・表情画像が `outfit_id` 単位。共有マスタ1行に「キャラごとに違う画像」は載らない | 1,2 | **大**。「参照のみ」方式の核心 |
| C4 | 表情フォールバックが `outfits.character_id` を直接前提にしている | 2 | 中 |
| C5 | `change_outfit` は `outfit_id` 直指定。マスタ衣装を着せるには「対象キャラ×マスタ」の解決が要る | 4 | 中 |
| C6 | 下着が衣装行の2列。衣装を着替えると下着も必ず一緒に変わる。日次抽選の置き場も無い（衣装行は定義であって状態ではない） | 6 | **大** |
| C7 | 現在衣装が**セッション単位**で、部屋移動のたびに既定へ戻る（同行時のみ持ち越し） | 3,4 | **大**。「次のデートに着てくる」が現状不可能 |
| C8 | `items` と `outfits` は完全に別テーブル。所持・受け渡し・購入・発見の仕組みが衣装から一切使えない | 3,5 | 中（再利用で解ける） |
| C9 | 部屋の入手候補は `item_categories` 駆動。衣装にカテゴリも属性キーも無い | 5 | 中 |
| C10 | `resolveOutfitTags` 系がフラットな19列オブジェクト1個を前提。素体・衣装・下着を別実体にすると全読み出し経路に影響 | 2,6 | 中（合成層で吸収可能） |
| C11 | 脱衣ラダーの `character_statuses` が `OUTFIT_TAG_FIELDS` の列名を文字列で持つ。列構成を変えると既存コンテンツが壊れる | 2,6 | 中。**列名は変えない方針が要る** |
| C12 | モブキャラ（`is_mob`）の状態はセッション単位でリセットされる。下着の日次抽選をルート単位で持つと整合しない | 6 | 小。仕様判断で回避可 |

---

## 4. 方針案

### 4.1 中核：`outfits` は残し、その上に「マスタ」を足す

`outfits` を潰してキャラがマスタを直接指すのではなく、**`outfits` を「キャラ×衣装の実体（インスタンス）」として維持したまま、`outfit_masters` を新設して参照させる**。

```
outfit_masters（新規・共有定義）
  name, カテゴリ, 属性キー, 価格
  衣服タグ16列（列名は既存 OUTFIT_TAG_FIELDS のまま ← C11）
  garment_operations

outfits（既存・キャラ側インスタンス）
  character_id                 ← 維持（C3/C4/C5 が自動的に無傷）
  + outfit_master_id           ← NULL=独自衣装
  + link_mode 'copy'|'reference'
  standing_image_path / is_default / 表情画像  ← 維持
```

- **完全取り込み（copy）**＝マスタのタグを `outfits` 行にコピー。以後キャラ個別に編集可。今の挙動そのもの
- **参照のみ（reference）**＝ `outfits` 行はタグを持たず、読み出し時にマスタから解決

この形にすると `current_outfit_id`・画像・表情フォールバック・`change_outfit`・エクスポートが**すべて現状のまま動く**。変更が要るのは「タグを読む瞬間」だけ。

### 4.2 素体タグをキャラへ（C2）

`characters` に素体タグ列を新設し、`main_features`/`hairstyle` の帰属をキャラへ移す。要望2の「新規UIが必要か？」への回答＝**必要**。キャラ編集画面に素体タグ欄を置く。

移行は自動では決められない（多衣装キャラ17人中16人で値が食い違う）→ **§5 の判断ポイント①**。

### 4.3 合成層を1枚挟む（C10 の吸収）

素体・衣装・下着が別実体になっても、`resolveOutfitTags` / `computeNudityTags` / 脱衣ラダー / `imagePromptBuilder` は**フラットな19列オブジェクト**を受け取り続けられるようにする。

```
composeWornOutfit(character, outfitInstance, underwearState)
  → { main_features, hairstyle, clothing_*, underwear_*, belongings, garment_operations }
```

キャラ素体＋（マスタ or ローカル）衣服＋下着枠をこの1関数でマージして既存と同じ形を返す。**既存の合成・抑制・破れ・露出判定は一切触らない。** 影響範囲をここで止めるのが要点。

### 4.4 下着を独立枠に（C6）

- `outfit_masters.slot` で「通常衣装／下着」を区別。下着マスタは `underwear_upper`/`underwear_lower` のみを持つ
- 着用中の下着は**ルート単位の状態**として別テーブルに持つ（`playthrough_character_underwear` 等、`relationship_states` と同じスコープ）
- 日付切り替わり（`advanceTime` の day ロールオーバー分岐、`timeSkip` も同様）で、World設定がONなら抽選し直す
- 抽選プールは「キャラの好み属性キー」×「下着マスタの属性キー」の一致で絞る（`attributeTagMatching.js` の既存ヘルパをそのまま使う。`すべて` ワイルドカードも効く）
- World単位のON/OFF（`worlds` に列追加）。OFFなら従来どおり衣装行の下着列を使う

### 4.5 アイテム化は `items` に相乗り（C8/C9）

衣装専用の所持・受け渡し・購入・発見を作らず、**`items` 行が `outfit_master_id` を指す**形にする。

- 所持・受け渡し（`transferItem`）・購入（`buy_price`＋`is_shop`）・部屋での発見（`itemDiscovery.js` のカテゴリ抽選）・`grant_item`/`grant_random_item`/`has_item` が**全部そのまま使える**
- 「持っている」と「着ている」は別概念なので、`item_use` 系の行動コマンドに「着る」を追加して、所持衣装 → `outfits` インスタンス生成＋着用、へ繋ぐ
- 要望5の「衣装の属性キー」は `outfit_masters.attribute_tags`、「衣装のカテゴリ」は既存 `item_categories` を流用（部屋の候補指定は `room_template_item_categories` が既にある）

### 4.6 イベントから着せる（C5）

`change_outfit` を拡張し、`outfit_id` 直指定に加えて **`outfit_master_id` 指定**を受け付ける。対象キャラ側にそのマスタのインスタンスが無ければその場で作る（`link_mode='reference'` で十分）。対象指定は既存の `resolveSingleTargetId`（`mentioned`/`condition_matched` 等）をそのまま使うので、要望4の「ランダム指定も既存の仕組みで」は満たせる。

### 4.7 着用衣装の持続（C7）

「プレゼントした衣装を次のデートで着てくる」を成立させるには、現在衣装をルート単位に持ち上げる必要がある。`room_session_characters.current_outfit_id` は表示・履歴のために残しつつ、**新セッションの初期値をルート単位の「既定衣装の上書き」から引く**形にするのが最小の変更。

---

## 5. 決定事項（2026-08-02）

### ① 素体タグ：キャラに一本化＋衣装側に上書き欄を残す。**データ整理は後回し**

- `characters` に素体タグ列を新設。`outfits` 側の `main_features`/`hairstyle` は**上書き欄として残す**
- 合成規則：衣装側に値があればそれを使い、空ならキャラ側の値を使う
- これにより「衣装ごとに髪型が変わる（ポニーテール等）」も表現できる
- **既存データのマージ・整理は実装順の最後〜後半に回す**（どうぶつかるか読み切れないため）。列を足した直後はキャラ側が空＝全件が衣装側の値で解決される＝**現行と完全に同じ挙動**になるので、整理を後回しにしても壊れない
- 整理作業そのものを §6 の工程に独立したタスクとして残す

### ② 衣装マスタのWorldスコープ：`character_statuses` 式の多対多

- `world_character_statuses` と同じ形の中間テーブル（`world_outfit_masters` 等）
- 「水着は複数Worldで共有、制服はこのWorldだけ」が正確に表現できる
- アタッチ操作UIが要る（既存のキャラ状態画面のUIパターンを流用）

### ③ 下着：独立枠にする。衣装側に「下着を上書きする」フラグ

- 既定は下着枠が勝つ（＝衣装を着替えても下着は変わらない）
- 衣装マスタに「この衣装は下着を上書きする」フラグを持たせ、ONの衣装は自身の `underwear_*` 列が優先される
- **既存の水着17件はフラグONにするだけで現行どおり動く**（データ手直し不要）

### ④ アイテム化：`items` に相乗り

- `items` 行が `outfit_master_id` を指す
- 所持・受け渡し（`transferItem`）・購入（`buy_price`＋`is_shop`）・部屋での発見（`itemDiscovery.js`）・`grant_item`/`grant_random_item`/`has_item` を全部そのまま使う
- アイテム一覧での混在は `item_categories` で分離

---

## 6. 実装順（案）

前段ほど「入れても現行挙動が変わらない」ように並べてある。

| 段 | 内容 | 現行への影響 | 状態 |
|---|---|---|---|
| 1 | **合成層 `composeWornOutfit()` の導入**。現時点では `outfits` 行をそのまま返すだけ。全読み出し経路（`resolveOutfitTags` 呼び出し元）をこの関数経由に寄せる | なし（同じオブジェクトが返る） | **完了（2026-08-02、`server/src/services/outfitComposition.js`新設、7箇所を経由済み）** |
| 2 | `characters` に素体タグ列を追加。合成層に「衣装側が空ならキャラ側」の規則を実装。**キャラ側は空のまま** | なし（全件が衣装側で解決） | **完了（2026-08-02、migration 0088、`composeWornOutfit(characterId, outfit)`に拡張、キャラ編集画面に入力欄追加）** |
| 3 | `outfit_masters` ＋ 多対多中間テーブル ＋ 管理UI新設。`outfits` に `outfit_master_id` / `link_mode` を追加 | なし（既存衣装は `master_id=NULL` のまま） | 未着手 |
| 4 | マスタ→キャラ取り込み（copy / reference）のUI。合成層が reference を解決 | 新機能のみ | 未着手 |
| 5 | `outfit_masters.slot='下着'` ＋ ルート単位の着用下着テーブル ＋ 「下着を上書きする」フラグ ＋ 日次抽選（`advanceTime` / `timeSkip` の day ロールオーバー） ＋ World単位ON/OFF | OFF既定なら影響なし | 未着手 |
| 6 | `items.outfit_master_id` ＋ 「着る」行動コマンド ＋ 部屋での発見・購入対応 | 新機能のみ | 未着手 |
| 7 | `change_outfit` に `outfit_master_id` 指定を追加 | 既存パラメータは維持 | 未着手 |
| 8 | 着用衣装のルート単位持続（C7 の修正） | **挙動が変わる**（部屋移動で既定に戻らなくなる） | 未着手 |
| 9 | エクスポート/インポートのマスタ対応（名前ベース解決） | — | 未着手 |
| 10 | **既存データ整理**：`main_features`/`hairstyle` のキャラ側への集約、`main_features` に混入した衣服タグの分離、同名衣装のマスタ化 | 手作業込み | 未着手（§6.1参照） |

### 6.1 第10段（既存データ整理）の現在の進捗（2026-08-02 記録）

キャラごとに整理状況が分かれている。**人力対応が必要な箇所のため状態を記録**:

- **基本衣装〜下着まで定義が完了しているキャラ**：基本衣装・キャラ素体情報の整理も完了済み
- **それ以外のキャラ**：ユーザー側でタグ関連（素体タグと衣装タグの切り分けなど）を整理作業中

→ 第10段（既存データ整理）に着手する際は、全キャラ一括ではなく**キャラごとの整理済み/未整理の状態を前提に**進める。
