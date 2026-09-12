# Settings画面に「キャラ×場所」指定のi2i参照生成テストツールを追加

# 背景（Context）

既存の画像生成テスト機能は2系統あったが、どちらも「キャラ＋部屋」を任意に組み合わせて試すことができなかった：
- Settings画面の画像種別ごとのテスト生成（`ImageGenerationSettingRow`、scene/event含む）は`resolveSample(kind)`が機械的に「最もidが小さいroom_session」をサンプルにしており、参照画像はそのセッションにたまたま参加していたキャラの立ち絵次第で不安定
- キャラ編集画面の衣装テスト生成（`testGenerateOutfitPreview`）は特定の衣装を単体でテストできるが、event画像のテストは`location_tags`/`atmosphere_tags`/`prop_tags`/`weather_tags`/`time_slot_tags`を全て空文字にしている（衣装編集には部屋の情報が無いため）

ユーザーからi2i参照アンカー方式の生成品質を詰めるため、対象キャラ（と衣装）・対象の部屋を自分で指定してテスト生成できる場所をSettings画面に追加してほしいとの依頼。調査の結果、scene/eventの7プレースホルダは実際のroom_session/playthroughが無くても`(worldId, roomTemplateId, characterId, outfitId)`だけから全て再現できることを確認した。

# 実装

## サーバー: `imageSettingsTestGenerator.js`
- `testGenerateForKind`内にあった「サンプル→生成→保存」ロジックを`generateFromResolvedSample(kind, settings, sample, options)`として切り出し（挙動そのままの純粋なリファクタ、`options.mode`で生成方式を上書き可能に拡張）
- 新規`resolveExplicitSceneSample({ characterId, outfitId, worldId, roomTemplateId, extraHint })`：`resolveOutfitTags(composeWornOutfit(...))`で衣装タグ、`listPropsForWorldRoom(worldId, roomTemplateId)`で小道具タグ、部屋テンプレート自身の`location_tags`/`atmosphere_tags`列、World設定の先頭の天候/時間帯選択肢を天候/時間帯タグの既定値として使う
- 新規`testGenerateReferenceScene({ kind, characterId, outfitId, worldId, roomTemplateId, extraHint, mode, previewFullCanvas })`：**保存済みの**`image_generation_settings`（フォーム編集中の値ではない）を使い、上記サンプルと合わせて共有ヘルパーへ渡す

## サーバー: ルート（`routes/settings.js`）
既存の`POST /image-generation-settings/:kind/test-generate`と同じ`enqueueImageJob`パターンで`POST /image-generation-settings/:kind/test-generate-reference-scene`を追加。

## クライアント
- `api/settings.js`に`testGenerateReferenceScene(kind, data)`を追加
- `SettingsPage.jsx`に新規カード`ReferenceSceneTestGeneratorSection`を追加（`ImageGenerationSettingsSection`の直後）：World→部屋テンプレート／キャラ→衣装／画像種別（scene・event）／生成方式の上書き（任意）／追加ヒント／生成ボタン＋結果表示（単一画像＋プロンプト文、既存の`ImageGenerationSettingRow`と同じ表示パターン）

## 副次的な後片付け
実装検証中、新機能のキャラ選択プルダウンに見慣れないキャラ名（`大翔（モブ）`等）が並んでいるのを発見。調査の結果、このセッション中のモブお気に入り昇格機能の検証で作られた`is_promoted_mob`キャラ8件が、`deletePlaythrough`では削除されない（`room_sessions`のみ削除、キャラ行自体は独立して残る）ため、テスト用playthroughを都度削除していたにもかかわらず孤立して残っていたことが判明。全8件を`deleteCharacter`で削除した。

# 検証

1. サーバーの各タグ解決関数を直接呼び出し、`character_tags`/`prop_tags`/`location_tags`/`atmosphere_tags`/`style_preset`が期待通り解決されること、`weather_tags`/`time_slot_tags`は該当Worldにタグマップ未設定の場合は空文字にフォールバックすることを確認
2. ブラウザでWorld→部屋テンプレート→キャラ→衣装→種別→生成方式(anchor_i2i)の一連の選択→生成ボタンを実行し、koboldcpp未接続エラー（このdev環境の既知の制約）まで正しく到達することを確認——検証・タグ解決・アンカー画像読み込みまでのロジックが正しく通っていることの証拠
3. 既存の`ImageGenerationSettingRow`側のテスト生成ボタンも同じくkoboldcpp未接続エラーまで正しく到達することを確認し、リファクタによる回帰が無いことを確認
4. 副次的に発見した孤立`is_promoted_mob`キャラ8件を削除
