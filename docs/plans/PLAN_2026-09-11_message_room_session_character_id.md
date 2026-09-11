# messagesにroom_session_character_idを追加し、名前/アイコン解決を安定化（項目4）

# 背景（Context）

項目4「ランダムキャラの@メンションと実際に表示されるキャラ名が一致していないケースがあった」の原因調査で、モブお気に入り昇格(`repointParticipantCharacter`)が`room_session_characters`行の`character_id`を昇格前の共有モブidから新キャラidへその場で書き換える一方、`messages`テーブルは`character_id`のみを保持しており、昇格前に発言した過去メッセージの`character_id`は書き換わらず昇格前の共有モブidを指し続けることが分かった。サーバー側の会話履歴解決(`promptBuilder.js`)・クライアント側のチャットログ解決(`ChatPage.jsx`/`SessionLogPage.jsx`)はいずれも`character_id`で参加行を検索するため、昇格後はその共有モブidを持つ参加行が無くなり、昇格前の過去メッセージの表示名・アイコンが解決できなくなっていた。

「モブ登場時点で常に固有キャラ行を生成し、連れ出し確定でプール、それ以外は破棄する」案も検討したが、破棄を実削除にすると連れ出されなかった登場（頻度が高い）の過去ログまで解決不能になり悪化する。ユーザーの指示（連れ出し確定での固有化が目的なので実装コスト・リスクが小さい方を選ぶ）に従い、`messages`に`room_session_character_id`列を追加し、昇格の前後で不変な「参加インスタンスid」で解決する方式を採用した。

# 実装

## スキーマ（migration 0132）
`messages`に`room_session_character_id INTEGER REFERENCES room_session_characters(id)`を追加。ベストエフォートのバックフィル（同一`room_session_id`×`character_id`の参加行が一意に見つかる行だけ埋める、モブ重複出演等で複数該当する場合はNULLのまま）も同時実行。

## 保存側
`messagesRepo.js`の`createMessage`：これまで`room_session_character_id`はステータススナップショット計算にしか使われず(コメントに「not a messages column」と明記)INSERTに含まれていなかった。カラムを追加しINSERT/VALUESに含めた。呼び出し元のうち`roomSessions.js`のメイン会話フローは既にこの値を渡していたため無変更、`insertDialogue.js`（イベントの台詞挿入アクション）と`modelEval/runner.js`（モデル評価ハーネス）は新たに渡すよう追加。

## 解決側
- `promptBuilder.js`の`buildHistoryMessages`内`nameFor`：`characterId`単体ではなく`{characterId, roomSessionCharacterId}`を受け、`roomSessionCharacterId`があればそちらを優先して`session.all_participants`を検索するよう変更。退室マーカーのクエリにも参加行idを追加し同じ経路に乗せた。
- `ChatPage.jsx`/`SessionLogPage.jsx`の`participantFor`/`expressionImageFor`：メッセージオブジェクトを受け、`message.room_session_character_id`があれば優先して検索するよう変更。

どちらも見つからない場合(移行前の過去メッセージ等)は従来通り`character_id`ベースの解決にフォールバックする——既存挙動より悪化しない。

# 検証

1. migration適用後、117件中115件の既存キャラメッセージがバックフィルされたことを確認。
2. 隔離済み使い捨てplaythroughで、モブにフレーバー(苗字・名前)を割り当て→昇格前にメッセージ送信→お気に入り昇格(`character_id`が87→新キャラidへ差し替わる)→昇格後にもメッセージ送信、という一連の流れを直接スクリプトで再現。昇格前メッセージの`character_id`が旧共有モブidのまま(=従来ロジックなら解決不能)であることを確認した上で、`room_session_character_id`経由なら昇格前・昇格後どちらのメッセージも正しく「（プロモート後の名前）」に解決されることを確認。
3. 同じ流れをブラウザで確認——ChatPage・SessionLogPageの両方で、昇格前後のメッセージがどちらも同じ正しい名前・アイコンで表示されることを確認。
4. 通常キャラの発言・退室マーカーの回帰が無いことを確認。
5. テスト用playthroughを削除して後片付け。
