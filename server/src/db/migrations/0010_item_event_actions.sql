-- Rebuild event_actions to add 'grant_item'/'remove_item' action types (SQLite
-- requires a full table rebuild to change a CHECK constraint). No other table
-- references event_actions as a parent, so this is a plain copy-drop-rename.
CREATE TABLE event_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'character_join', 'character_leave', 'insert_dialogue', 'generate_image', 'set_flag',
      'change_relationship', 'change_outfit', 'advance_time', 'grant_item', 'remove_item'
    )
  ),
  params TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO event_actions_new (id, event_definition_id, action_type, params)
  SELECT id, event_definition_id, action_type, params FROM event_actions;
DROP TABLE event_actions;
ALTER TABLE event_actions_new RENAME TO event_actions;
