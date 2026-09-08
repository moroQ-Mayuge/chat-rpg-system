# モブのランダムペルソナ付与 + お気に入りキャラ昇格

# 背景（Context）

現在の「モブ」機構（`characters.is_mob`、migration 0041/0043/0045）は、関係値・呼び方・一部ステータスをプレイスルー単位ではなくセッション単位（`room_session_id`+`room_session_character_id`）でスコープすることで、同じ`character_id`が複数の部屋に同時に無関係な人物として登場したり、同一部屋に複数同時に重複出演（レターサフィックス`A`/`B`表示、`participantNaming.js`）したりできる仕組みとして機能している。ただし、モブの`name`・`personality`・`speech_style`等は`characters`テーブルの共有マスタ行そのものであり、全インスタンスが同じ人格・同じ名前で喋る。

ユーザー要望：
1. モブ属性キャラが部屋に登場する際、見た目（衣装・タグ）はそのままに、World側で用意した「ベース設定（ペルソナプリセット）」からランダムに口調・性格・名前一式を選んで付与し、表示名の末尾に「（モブ）」を付ける。
2. そうして個性を得たモブを同行させ、プレイヤーが明示的に「お気に入り登録」した場合、子供キャラ（`origin_playthrough_id`+`is_auto_created`）と同じ「ルート専用キャラ」として`characters`テーブルに実体化し、記憶・関係値・ステータスを以後保持させる。ただしキャラエディタ（`CharactersPage.jsx`）には一覧表示させない。

ユーザーとの相談で決まった方針：
- お気に入り昇格は**手動確認**（子キャラの「起こす」ボタンと同じ方式）。同行させただけでは自動昇格しない。
- ペルソナプリセットのプールは**Worldごと**。1プリセット＝名前・口調・性格などをセットにした**1ペルソナ一式**。
- `setAccompanying`/`removeParticipant`のインスタンス精度不足（同一character_idのモブが同時に複数居ると1体だけを操作できない）を**今回修正する**。
- ペルソナの決め方はWorldごとに2モード選択制：**プリセットプールからランダム抽選**（既定）／**都度LLM生成**（元のモブの職業・属性タグ等を文脈に、非同期で生成——部屋登場をブロックしない）。

# 設計のポイント

## 1. ペルソナプリセット（新規マスタ、World単位）
新規テーブル`mob_flavor_presets`（`world_id`, `name`, `personality`, `speech_style`, `sentence_ending`, `first_person`, `call_user_as`, `call_others_as`, `is_generated`）。`pose_masters`と同型のCRUD＋World選択。管理画面`client/src/pages/MobFlavorPresetsPage.jsx`。

`worlds.mob_random_flavor_enabled`（既定OFF）と`worlds.mob_flavor_generation_mode`（`'preset'|'llm'`、既定`'preset'`）。

## 2. 部屋登場時のランダム付与
`room_session_characters.mob_flavor_preset_id`を追加。`seedParticipantsForRoom`内、モブかつトグルONのとき、presetモードはその場でランダム抽選、llmモードはNULLのままにして非同期ジョブに任せる。継続セッションの部屋移動は既存行がそのまま残るため自然に保持され、セッション区切り時のcarryOverParticipantsにも`current_outfit_id`と同じ要領で運ぶ。

## 2b. LLM生成モードの非同期ジョブ
`server/src/services/mobPersonaGeneration.js`の`generateMobFlavorAsync`：モブの職業・属性タグ・種族・性別・年齢・備考を文脈にした指示文を組み立て、`characterAssist.js`の`generateCharacterSheet`をそのまま呼び、返ってきたペルソナ系フィールドだけを`mob_flavor_presets`に`is_generated:1`で保存、該当参加者行に反映して`participants_changed`をブロードキャストする。呼び出し元（セッション作成/`/move`ルート）がレスポンス送出後にfire-and-forgetでキックする（`autoOutfitImage.js`と同じ配置）。

## 3. 表示名とLLMプロンプトへの反映
`getRoomSession`の参加者SELECTに`mob_flavor_presets`をLEFT JOIN。`participantNaming.js`の`withDisambiguatedNames`はベース名を`mob_flavor_name+（モブ）`に差し替えてから既存のA/B連番ロジックに通す。`promptBuilder.js`はキャラクターシート組み立て時に口調・性格系フィールドだけプリセット値で上書きする（外見・衣装はベース行のまま）。

## 4. お気に入り昇格（手動、子キャラ実体化と同型）
`server/src/services/mobPromotion.js`の`promoteMobToFavorite(sessionId, roomSessionCharacterId)`：モブ行の外見系フィールドを継承しつつペルソナ系フィールドをプリセット値で上書きした新規`characters`行を作成（`is_mob:false`, `origin_playthrough_id`, `is_auto_created:true`, `is_promoted_mob:true`）。現在の衣装を複製して新キャラ専属にし、モブスコープの現在の関係値・ステータス・呼び方をプレイスルー単位の状態として引き継ぐ。該当`room_session_characters`行を新キャラにrepointする。`characters.is_promoted_mob`を追加し、`CharactersPage.jsx`は無条件に除外する（子キャラの`hideRouteScoped`のような任意トグルにはしない）。

## 5. `setAccompanying`/`removeParticipant`のインスタンス精度修正
両関数に任意の`roomSessionCharacterId`引数を追加し、指定時は`AND id = ?`を条件に加える。デバッグトグルは`p.id`を渡し、`set_accompanying`イベントアクションは`execCtx.instanceHintByCharacterId`（`change_relationship`と同じ取得方法）を渡す。

# 実装ファイル一覧

- 新規マイグレーション`0127_mob_flavor_and_promotion.sql`：`mob_flavor_presets`テーブル、`worlds.mob_random_flavor_enabled`/`mob_flavor_generation_mode`、`room_session_characters.mob_flavor_preset_id`、`characters.is_promoted_mob`。
- `server/src/db/repositories/mobFlavorPresetsRepo.js`（新規）
- `server/src/db/repositories/roomSessionsRepo.js`：seedParticipantsForRoomのモード分岐、getRoomSessionのJOIN、setAccompanying/removeParticipantのインスタンス精度
- `server/src/db/repositories/charactersRepo.js`：createCharacterにis_promoted_mob列を追加
- `server/src/services/mobPersonaGeneration.js`（新規）、`server/src/services/mobPromotion.js`（新規）
- `server/src/services/participantNaming.js`、`server/src/services/promptBuilder.js`
- `server/src/routes/mobFlavorPresets.js`（新規）、`server/src/routes/roomSessions.js`、`server/src/routes/playthroughs.js`
- `client/src/pages/MobFlavorPresetsPage.jsx`（新規、ナビ追加）、`client/src/pages/WorldsPage.jsx`、`client/src/pages/ChatPage.jsx`、`client/src/pages/CharactersPage.jsx`

# 検証（実施済み）

1. マイグレーション適用、新テーブル・新列を確認。
2. presetモード：Worldトグル+プリセット登録後、モブが登場する部屋で表示名が「〈プリセット名〉（モブ）」になること、同一character_idの重複インスタンスがそれぞれ独立に抽選されることを実機確認。
3. llmモード：`generateMobFlavorAsync`を直接実行し、約10秒で職業・性別を踏まえたペルソナが生成されることを確認（初回テストでgender未考慮による名前の性別不一致を発見し、instructionにgenderを追加して修正）。
4. お気に入り登録：実チャットからボタンを押して昇格を実行し、新規characters行（is_mob=0, origin_playthrough_id, is_auto_created=1, is_promoted_mob=1）の作成、衣装の複製、関係値・自己ステータス全軸のプレイスルー単位への引き継ぎ、room_session_charactersのrepoint、CharactersPageからの完全非表示、部屋移動後も新キャラとして同行し続けることを確認。
5. 副産物で見つけたバグ2件を修正：(a) `is_promoted_mob`をcreateCharacterのINSERT文に含め忘れていた、(b) 新規「お気に入り登録」ボタンの`{p.is_accompanying && ...}`がSQLite由来の生整数0をJSXにレンダリングしてしまう（既知のSQLite-boolean-JSXバグパターン）ため`Boolean()`でラップ。
6. 検証用に作成したペルソナプリセット・昇格済みキャラ・生成メッセージ・World設定はすべて元に戻した。
