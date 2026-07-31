-- 新アクション time_skip を許可する。SQLiteはCHECK制約をALTERできないため、
-- 0083等と同じくテーブルを作り直す。
--
-- advance_time との違いは単位と後始末。あちらは時間帯を送るもので、こちらは
-- 日数(年単位も)を飛ばしたうえで、加齢とその期間の記憶要約まで行う。
CREATE TABLE event_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'character_join', 'character_leave', 'insert_dialogue', 'generate_image', 'set_flag',
      'change_relationship', 'change_outfit', 'advance_time', 'grant_item', 'remove_item',
      'change_status', 'set_address', 'spend_money', 'set_scene_situation', 'grant_random_item',
      'set_character_impression', 'add_character_memory', 'make_item_available',
      'conceive', 'end_pregnancy', 'set_timer', 'clear_timer', 'time_skip'
    )
  ),
  params TEXT NOT NULL DEFAULT '{}',
  outcome TEXT NOT NULL DEFAULT 'always' CHECK (outcome IN ('always', 'success', 'failure')),
  outcome_node_id INTEGER REFERENCES event_outcome_nodes(id) ON DELETE CASCADE
);
INSERT INTO event_actions_new (id, event_definition_id, action_type, params, outcome, outcome_node_id)
  SELECT id, event_definition_id, action_type, params, outcome, outcome_node_id FROM event_actions;
DROP TABLE event_actions;
ALTER TABLE event_actions_new RENAME TO event_actions;
