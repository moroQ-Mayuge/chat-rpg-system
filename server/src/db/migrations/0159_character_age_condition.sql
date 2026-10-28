-- 条件 character_age: 対象キャラ(@メンション/同席者/固定id)の年齢(characters.age_real)が
-- min_age 以上かを判定する。婚約・結婚のイベントのように「キャラ指定なしの汎用イベント」
-- を成人限定にするための年齢ガード(年齢が不明のキャラは不成立=安全側)。
-- event_conditions.condition_type のCHECK制約に値を足すため、0156と同じ手順でテーブルを再構築する。
CREATE TABLE event_conditions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL CHECK (
    condition_type IN (
      'probability', 'turn_count', 'keyword', 'relationship_threshold', 'flag_state',
      'participant_count', 'has_item', 'llm_judge', 'has_status', 'has_outfit', 'has_money',
      'has_pose', 'relationship_probability', 'in_sub_room', 'character_age'
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
