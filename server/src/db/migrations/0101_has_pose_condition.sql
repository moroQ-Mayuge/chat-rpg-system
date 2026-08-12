-- 新条件 has_pose を許可する。SQLiteはCHECK制約をALTERできないため、
-- テーブルを作り直す。
CREATE TABLE event_conditions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL CHECK (
    condition_type IN (
      'probability', 'turn_count', 'keyword', 'relationship_threshold', 'flag_state',
      'participant_count', 'has_item', 'llm_judge', 'has_status', 'has_outfit', 'has_money',
      'has_pose'
    )
  ),
  params TEXT NOT NULL DEFAULT '{}',
  phase TEXT NOT NULL DEFAULT 'trigger' CHECK (phase IN ('trigger', 'outcome')),
  outcome_node_id INTEGER REFERENCES event_outcome_nodes(id) ON DELETE CASCADE
);
INSERT INTO event_conditions_new (id, event_definition_id, condition_type, params, phase, outcome_node_id)
  SELECT id, event_definition_id, condition_type, params, phase, outcome_node_id FROM event_conditions;
DROP TABLE event_conditions;
ALTER TABLE event_conditions_new RENAME TO event_conditions;
