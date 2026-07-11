-- 「関係」（他人/顔見知り/恋人等）を character_statuses の排他グループ拡張
-- として、「呼び方」をステータス付与連動+新規イベントアクションとして実装
-- するための土台。

-- exclusive_group: 同じグループ名を持つステータスはキャラごとに常に1つだけ
-- アクティブになる（grantStatusが同グループの他のアクティブなステータスを
-- 自動解除する）。「関係」専用ではなく汎用の排他状態機構として追加。
ALTER TABLE character_statuses ADD COLUMN exclusive_group TEXT;

-- default_address_on_grant: このステータスが付与されたとき、
-- character_address_states に自動反映する「呼び方」の既定値（任意）。
ALTER TABLE character_statuses ADD COLUMN default_address_on_grant TEXT;

-- 「呼び方」：プレイスルー×キャラごとに1つの可変文字列。relationship_states
-- と同じ「プレイスルー×キャラごとに1行」パターン。セッション単位のスコープ
-- 分けはしない（プレイスルーを通じた持続的な特性として扱う）。
CREATE TABLE character_address_states (
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  current_address TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (playthrough_id, character_id)
);

-- 新規イベントアクション set_address を追加するため event_actions の
-- CHECK制約を再構築（0024と同じ手順）。
CREATE TABLE event_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'character_join', 'character_leave', 'insert_dialogue', 'generate_image', 'set_flag',
      'change_relationship', 'change_outfit', 'advance_time', 'grant_item', 'remove_item',
      'change_status', 'set_address'
    )
  ),
  params TEXT NOT NULL DEFAULT '{}',
  outcome TEXT NOT NULL DEFAULT 'always' CHECK (outcome IN ('always', 'success', 'failure'))
);
INSERT INTO event_actions_new (id, event_definition_id, action_type, params, outcome)
  SELECT id, event_definition_id, action_type, params, outcome FROM event_actions;
DROP TABLE event_actions;
ALTER TABLE event_actions_new RENAME TO event_actions;
