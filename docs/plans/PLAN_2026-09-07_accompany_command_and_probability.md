# 同行コマンド化・許可判定イベント化・退出免除

# 背景（Context）

現在の「同行」機構は`room_session_characters.is_accompanying`フラグで実装済み・完動している（`switchRoomWithinSession`/`createRoomSession`の`carryOverParticipants`が部屋移動・セッション区切り時に正しく引き継ぐ）。しかし:

1. 唯一の操作口が`ChatPage.jsx`の参加キャラ一覧内のトグルボタン（`POST /room-sessions/:id/participants/:characterId/accompanying`を直接叩くだけ）で、プレイヤーが無条件・無確認でON/OFFできてしまう。
2. キャラ側の意思決定が一切無い（頼めば必ず同行する）。
3. `character_leave`アクション（ランダム選出・指定ID狙い撃ちの両方）が同行中のキャラも退出対象にしてしまう。

ユーザー要望：①同行の申し出を会話コマンド化し、②可否をイベントの確率判定（信頼度・恋愛度・依存度のうち最大値を採用、値に連続スケーリングする確率）に委ね、③現行の直接トグルはデバッグ用の手動オーバーライドとして残し、④同行中のキャラは（ランダム・指名を問わず）`character_leave`から完全免除する。

既存の`change_status`（脱衣）系イベント・`change_relationship`アクション・`relationship_threshold`条件と全く同じ「イベントエンジンの汎用プリミティブ + キャラ非依存の1〜2個のプリセットイベント」という設計を踏襲し、キャラ数分の手動コンテンツ作成を避ける。

# 設計のポイント

- **新規イベントプリミティブを2つ追加**し、キャラ固有のイベントを量産しない：
  - 新条件`relationship_probability`：対象キャラ（`character_id: "mentioned"`等、既存の`resolveSingleTargetId`と同じ解決規則）の指定`axis_ids`のうち、`(現在値 - min_value) / (max_value - min_value)`が最大の軸を採用し、その値を確率として`Math.random() < chance`を判定する。`probability.js`（固定確率）・`relationshipThreshold.js`（閾値判定、対象解決の参考実装）と並ぶ3本目の条件ファイル。
  - 新アクション`set_accompanying`：対象キャラを解決し、既存の`setAccompanying(sessionId, characterId, isAccompanying)`（`roomSessionsRepo.js`、変更不要）をそのまま呼ぶだけ。`change_relationship`/`characterLeave`と同じ対象解決パターン。
- **プリセットイベントは2つのみ**（`event_definitions.scope='global'`＝全World共通、`docs/SPEC.md`のキス/告白イベントと同型のoutcome分岐）：
  - 「同行を頼む」：trigger=`keyword`一致、outcome=`relationship_probability`（信頼度・恋愛度・依存度の3軸ID）、success時のみ`set_accompanying(character_id:'mentioned', is_accompanying:true)`。failure時は何もしない。
  - 「同行をやめさせる」：trigger=`keyword`一致のみ（確率判定なし、常に成功）、`set_accompanying(character_id:'mentioned', is_accompanying:false)`。
  - これらはEventsPage.jsx相当のUIで手動作成するのと同じ内容を、`eventDefinitionsRepo.js`の`createEventDefinition`等を直接呼ぶ一回限りのスクリプトで投入する。
- **会話コマンド自体はゼロ新規コード**：`action_commands`に`command_type='keyword'`の行を2つ追加するだけで、既存の`ActionCommandBar`/`sendKeywordCommand`（`ChatPage.jsx`）がそのまま拾って表示・送信する（脱衣コマンドと全く同じ仕組み）。対象キャラの指定は既存の@メンション選択UI（`mentionedNames`→`composeSendText`）を使う。
- **退出免除は`characterLeave.js`一箇所のみ**の変更で完結する（`removeParticipant`の呼び出し元はこのファイルだけとgrep済み）。`present`配列を「`is_accompanying`でないキャラのみ」に絞ることで、`random_from_present`は自然に同行キャラを候補から除外し、指定ID狙い撃ちも同じ配列に対する`includes`チェックに引っかかって弾かれる。専用の`skipped: { reason: 'accompanying' }`も明示的に返す。
- **既存の手動トグル（`ChatPage.jsx`）は残す**が、デバッグ用の手動オーバーライドと位置づけ、**World単位のON/OFF設定（新規`worlds.debug_accompany_toggle_enabled`、既定ON=現状維持）**で表示を制御する。他の`pose_enabled`等と同じ「Worldトグル→`ChatPage.jsx`側で条件描画」パターン。
- **コマンド／確率判定の方はWorldトグルを追加しない**：クラフト/買い物コマンドと同じく常時共通機能として扱う。Worldトグルが要るのは上記のデバッグ用手動オーバーライドのみ。

# 実装

## 1. マイグレーション `0126_accompany_event_primitives.sql`

`event_conditions`に`relationship_probability`、`event_actions`に`set_accompanying`をCHECK制約に追加（0101/0122と同じテーブル再作成手順）。既定の会話コマンド2つ（共通、`同行`カテゴリ、keyword_text=「同行して」「同行をやめて」）を投入。`worlds.debug_accompany_toggle_enabled`（既定1）を追加。

## 2. `server/src/services/eventEngine/conditions/relationshipProbability.js`（新規）

対象キャラの`axis_ids`のうち正規化値が最大の軸を確率として採用し判定する`evaluateRelationshipProbability`。`conditions/registry.js`に登録（`characterMatcherRegistry`には追加しない）。

## 3. `server/src/services/eventEngine/actions/setAccompanying.js`（新規）

対象キャラを解決し`setAccompanying()`を呼ぶだけの`executeSetAccompanying`。`actions/registry.js`に登録。

## 4. `server/src/services/eventEngine/actions/characterLeave.js`

`present`配列を`!is_accompanying`でフィルタし、指定ID狙い撃ちも`allParticipants`で同行判定して`{ skipped: true, reason: 'accompanying' }`を返すガードを追加。

## 5. コンテンツ投入（一回限りのスクリプト、マイグレーションではない）

`createEventDefinition`を直接呼び、「同行を頼む」（trigger=keyword「同行して」、outcome=relationship_probability[信頼度/恋愛度/依存度]、success→set_accompanying true）と「同行をやめさせる」（trigger=keyword「同行をやめて」、常時→set_accompanying false）の2件を作成。

## 6. `client/src/pages/EventsPage.jsx`

`CONDITION_TYPES`/`ACTION_TYPES`・デフォルトparams・編集用JSXブロック（`relationship_threshold`/`set_pose`のブロックを流用）を追加。

## 7. `client/src/pages/ChatPage.jsx`

`toggleAccompanying`ボタンの描画条件に`world?.debug_accompany_toggle_enabled`を追加し、ラベル/titleをデバッグ用と分かるように変更。

## 8. `client/src/pages/WorldsPage.jsx` / `worldsRepo.js`

`debug_accompany_toggle_enabled`のON/OFFチェックボックスと定型3点セット（parseWorld/createWorld/updateWorld）を追加。

# 検証

1. マイグレーション適用・CHECK制約・既定コマンド2件をスクリプトで確認。
2. `relationship_probability`条件を直接呼び出し、全軸0で常に失敗・恋愛度100で常に成功・mentionedなしでfalseを確認。
3. `set_accompanying`アクションと`character_leave`の退出免除（ランダム選出・指定ID狙い撃ちの両方）を直接呼び出しで確認。
4. `worldsRepo.js`の新フィールドをcreateWorld/updateWorldの往復で確認。
5. koboldcpp+SD起動状態で実プレイスルー（World4、純愛ルート）にて、@メンション＋「同行を頼む」「同行をやめさせる」コマンドを実際に送信し、恋愛度を高くした場合の成功・全軸0にした場合の失敗・解除の3パターンを確認。部屋移動での追従は既存機構により別途確認済み。
6. EventsPage.jsxで新条件・新アクションの編集UIが正しく表示・保存できることをブラウザで確認。
7. WorldsPageの新チェックボックスの表示・保存往復、ChatPage側での表示/非表示の切り替わりを確認。
8. 検証用に生成したメッセージ・退出させたモブ参加者・World4の一時設定は元に戻し、コンソールエラー（500）は無関係な既存事象と切り分け済み。
