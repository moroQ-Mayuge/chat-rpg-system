-- チャット欄へのステータス表示：3箇所（参加者ストリップ／折りたたみパネル／
-- チャット欄の顔アイコン付近）×3項目（自己ステータス／キャラ状態／関係ステージ）
-- のON/OFF設定。Worldが上限（既定は全OFF、notify_relationship_changesと同じ
-- 「開示系トグルは既定オフ」方針）、status_display_preferencesはプレイヤー
-- 個人の narrowing 設定（既定は全ON——Worldが許可した範囲をそのまま見せる）。
-- 実効表示可否はサーバー側でこの2つをANDして算出する（roomSessionsRepo.js）。
ALTER TABLE worlds ADD COLUMN status_display_settings TEXT NOT NULL DEFAULT '{"strip":{"self_stat":false,"status":false,"relationship_stage":false},"panel":{"self_stat":false,"status":false,"relationship_stage":false},"chat_log":{"self_stat":false,"status":false,"relationship_stage":false}}';

CREATE TABLE status_display_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  settings TEXT NOT NULL DEFAULT '{"strip":{"self_stat":true,"status":true,"relationship_stage":true},"panel":{"self_stat":true,"status":true,"relationship_stage":true},"chat_log":{"self_stat":true,"status":true,"relationship_stage":true}}'
);
INSERT INTO status_display_preferences (id) VALUES (1);

-- チャット欄の顔アイコン付近に「発言した時点の値」をログとして表示するための
-- スナップショット。以降そのキャラのステータスが変化しても、このメッセージの
-- 記録は変わらない（messagesRepo.jsのcreateMessageで character 発言時にのみ埋める）。
ALTER TABLE messages ADD COLUMN status_snapshot TEXT;
