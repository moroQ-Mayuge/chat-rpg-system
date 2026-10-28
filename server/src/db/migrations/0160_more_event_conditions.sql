-- イベント条件を追加する: companion_state(同行・デート中の状態)、character_attribute(キャラの属性タグ/
-- モブか/性別/職業)、character_present(特定キャラ・属性のキャラの同席)、owns_outfit(衣装マスタの所持)。
-- (has_item は同じ型のまま、params に持ち主(holder)と名前の部分一致を足しただけなので変更なし。)
-- event_conditions.condition_type のCHECK制約に値を足すため、0159と同じ手順でテーブルを再構築する。
CREATE TABLE event_conditions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL CHECK (
    condition_type IN (
      'probability', 'turn_count', 'keyword', 'relationship_threshold', 'flag_state',
      'participant_count', 'has_item', 'llm_judge', 'has_status', 'has_outfit', 'has_money',
      'has_pose', 'relationship_probability', 'in_sub_room', 'character_age',
      'companion_state', 'character_attribute', 'character_present', 'owns_outfit'
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
