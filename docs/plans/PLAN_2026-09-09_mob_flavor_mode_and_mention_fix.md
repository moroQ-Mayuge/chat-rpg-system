# モブ制御の追加要望・不具合修正（0127フォローアップ）

# 背景（Context）

2026-09-08にモブのランダムペルソナ付与＋お気に入り昇格（migration 0127、commit 7cc313e）を出荷した直後のプレイテストで、以下の要望・不具合報告があった。

1. **設定に「従来通り」の選択肢が無い**：現状はチェックボックス（ペルソナ付与ON/OFF）＋生成モード（preset/llm）だが、OFFにしてもモブは同行コマンド/デバッグトグルで連れ出せてしまう。「ペルソナを付けず、連れ出しもできない」従来の挙動を明示的な選択肢として欲しい。
2. **@メンション選択の名前が元のモブ識別子のまま**：参加キャラ一覧とチャットログの送信者名だけ`flavorAwareName`で差し替えたが、@メンションチップ・アイテム/着替え/変身パネルの対象選択と送信文・ステータスパネル・`SessionLogPage.jsx`は生の`p.name`のまま。
3. **連れ出しても生成されない不具合**：根本原因は2と同じ。サーバー側`resolveMentions()`は`withDisambiguatedNames`の`display_name`＝「〈ペルソナ名〉（モブ）」で`@`を照合するが、クライアントは`@〈元のモブ名〉`を送るため、ペルソナ付きモブへの@メンションが一切解決されない。結果、「同行を頼む」の`set_accompanying`が`no_target`でスキップされ、同行フラグが立たない。さらにLLM生成モードは新規セッション作成/`/move`時にしか生成をキックしないため、「続きから」で既存セッションに戻った場合や`character_join`で途中参加したモブには生成が走らない。
4. **昇格を手動ボタンから自動へ**：連れ出して部屋移動した時点（同行キャラが次のセッション/部屋へ引き継がれる時点）で自動的にキャラ情報をプール（実体化）する方式に変更する。

ユーザーとの相談で決まった方針：
- 自動昇格は**同行キャラが引き継がれる全経路**（`/move`の継続セッション切替・区切り再開、会話途中の時間帯区切り再開、イベントの`end_session`/`force_room_transfer`）で行う。
- LLM生成モードで未生成のまま連れ出した場合は**移動時にその場で生成を待つ**（失敗時は元のモブ名+「（モブ）」・元の性格のままペルソナ無しで実体化）。
- 「お気に入り登録」ボタンは**廃止**し、World設定はチェックボックス＋生成モードを**「従来通り／プリセット抽選／LLM生成」の1つのセレクト**に統合する。

# 設計と実装

## 1. 3択モード `worlds.mob_flavor_mode`（migration 0128）
`'off'`=従来通り(ペルソナなし・モブは連れ出し不可) / `'preset'` / `'llm'`。既存Worldは`mob_random_flavor_enabled=1のときmob_flavor_generation_mode、それ以外はoff`で自動移行。旧2列は残すが以後未使用。`worldsRepo.js`の`parseWorld`/`createWorld`/`updateWorld`、`seedParticipantsForRoom`/`addParticipant`/`triggerPendingMobFlavorGeneration`/`mobPromotion.js`/`WorldsPage.jsx`の参照をすべて`mob_flavor_mode`に置き換えた。

**'off'モードでの連れ出し禁止**：`eventEngine/actions/setAccompanying.js`（is_accompanying=trueかつ対象is_mobかつworld.mob_flavor_mode==='off'なら`{skipped:true, reason:'mob_not_accompaniable'}`）とデバッグルート（同条件で400）の両方にガードを追加。`ChatPage.jsx`のデバッグトグルボタンもモブ×offなら非表示。

## 2. `display_name`をサーバーから返す（メンション不一致の根治）
`participantNaming.js`の`participantBaseName(p)`を公開し、`roomSessionsRepo.js`の`attachParticipants`でアクティブ参加者に`withDisambiguatedNames`を適用して`display_name`を付与（プロンプト側と全く同じ計算＝必ず一致）。クライアントは`ChatPage.jsx`/`SessionLogPage.jsx`のあらゆる参加者名表示・@メンション照合・送信文組み立てを`p.display_name`に統一し、独自の`flavorAwareName`ヘルパーは削除した。

## 3. 自動昇格
`mobPromotion.js`に`promoteAccompanyingFlavoredMobs(session, world)`を追加：`is_active && is_accompanying && is_mob`な参加者について、llmモードで未生成ならその場で生成を待ち、`promoteMobToFavorite(..., {allowWithoutPreset:true})`で実体化する（プリセット無しでも元のモブの名前・性格のまま昇格）。フックは`sessionBoundary.js`の`closeAndReopenSession`（`/move`の区切り経路・時間帯区切り再開・`end_session`/`force_room_transfer`イベントがすべて経由）と、`/move`ルートの継続セッション経路（`switchRoomWithinSession`の直前）の2箇所。`carryOverParticipants`の既定マッピングに漏れていた`current_transformation_id`/`mob_flavor_preset_id`も追加した。旧「お気に入り登録」ボタン・`promoteMob`ミューテーション/API・`promote-mob`ルートは削除。

## 4. LLM生成のキック漏れ対策
`addParticipant`（`character_join`途中参加）にも`seedParticipantsForRoom`と同じモード分岐を追加。`generateReply`終盤（イベント処理後）と`GET /playthroughs/:id/active-session`（「続きから」）にも`triggerPendingMobFlavorGeneration`の呼び出しを追加し、未生成のまま残っているモブを毎回拾い直す。

# 検証（実施済み、World4=llmモードの実データで）

1. migration適用後、World4の`mob_flavor_mode`が旧設定(`llm`)から正しく移行されていることを確認。
2. 「続きから」でのアクティブセッション取得により、以前生成失敗していたモブ2体（koboldcpp再起動後）へのLLM生成キックが働き、性別を踏まえたペルソナ（サキ／田中結衣）が生成されることを確認。
3. @メンションチップが`display_name`（「サキ（モブ）」）で表示され、選択→「同行を頼む」送信で実際に`is_accompanying`が立つことを実チャットで確認（不具合3の再現ケースが解消）。全軸0のため確率判定で不成立になる例も確認し、恋愛度を100にブーストした再送信で成立することも確認（確率判定自体は既存仕様どおり）。
4. 継続セッション内の部屋移動（`switchRoomWithinSession`経路）で、同行中のサキが自動的に`characters`テーブルへ実体化（`is_mob=0`, `is_promoted_mob=1`, `origin_playthrough_id`設定済み）され、手動ボタン無しで新キャラとして部屋を移動し続けることを確認。
5. `is_promoted_mob=1`のキャラが`CharactersPage`に一切表示されないこと、サーバー側`/api/characters`には引き続き含まれる（既存方針どおり）ことを確認。
6. `off`モードのガード：デバッグルートへの直接POSTで`mob_not_accompaniable`が返り、非モブキャラの同行は影響を受けないことを確認。
7. テスト用に実体化したキャラ・ブーストした関係値は削除・リセットし、World4の設定は元の`llm`モードに戻した。
