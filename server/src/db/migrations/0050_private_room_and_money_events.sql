-- Private room mechanic (e.g. ホテルの部屋): a room flagged here skips the
-- normal tag-matched/random-row auto-population entirely, so only carried-
-- over accompanying characters are ever present -- no NPC interruptions.
ALTER TABLE room_templates ADD COLUMN suppress_auto_population INTEGER NOT NULL DEFAULT 0;

-- New event condition has_money (checks playthroughs.money) and action
-- spend_money (deducts it) so events can require/consume currency --
-- CHECK constraint rebuild, same procedure as 0024/0026/0029.
CREATE TABLE event_conditions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL CHECK (
    condition_type IN (
      'probability', 'turn_count', 'keyword', 'relationship_threshold', 'flag_state',
      'participant_count', 'has_item', 'llm_judge', 'has_status', 'has_outfit', 'has_money'
    )
  ),
  params TEXT NOT NULL DEFAULT '{}',
  phase TEXT NOT NULL DEFAULT 'trigger' CHECK (phase IN ('trigger', 'outcome'))
);
INSERT INTO event_conditions_new (id, event_definition_id, condition_type, params, phase)
  SELECT id, event_definition_id, condition_type, params, phase FROM event_conditions;
DROP TABLE event_conditions;
ALTER TABLE event_conditions_new RENAME TO event_conditions;

CREATE TABLE event_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'character_join', 'character_leave', 'insert_dialogue', 'generate_image', 'set_flag',
      'change_relationship', 'change_outfit', 'advance_time', 'grant_item', 'remove_item',
      'change_status', 'set_address', 'spend_money'
    )
  ),
  params TEXT NOT NULL DEFAULT '{}',
  outcome TEXT NOT NULL DEFAULT 'always' CHECK (outcome IN ('always', 'success', 'failure'))
);
INSERT INTO event_actions_new (id, event_definition_id, action_type, params, outcome)
  SELECT id, event_definition_id, action_type, params, outcome FROM event_actions;
DROP TABLE event_actions;
ALTER TABLE event_actions_new RENAME TO event_actions;
