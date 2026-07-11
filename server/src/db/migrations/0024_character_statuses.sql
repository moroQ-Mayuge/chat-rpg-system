-- キャラ状態（気絶/死亡等、カテゴリ値）— common+World固有の2段構成
-- （items/item_categories/action_commandsと同じパターン）。
CREATE TABLE character_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  persistence_scope TEXT NOT NULL CHECK (persistence_scope IN ('playthrough', 'session', 'accompanying')),
  removes_from_session INTEGER NOT NULL DEFAULT 0
);

-- playthrough_id / room_session_id は排他的：persistence_scope='playthrough'
-- の場合はplaythrough_idのみ、'session'/'accompanying'の場合はroom_session_id
-- のみをセットする（accompanying分の部屋移動時の引き継ぎは別途アプリ側で処理）。
CREATE TABLE character_status_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status_id INTEGER NOT NULL REFERENCES character_statuses(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  playthrough_id INTEGER REFERENCES playthroughs(id) ON DELETE CASCADE,
  room_session_id INTEGER REFERENCES room_sessions(id) ON DELETE CASCADE,
  locked INTEGER NOT NULL DEFAULT 0,
  granted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 新規イベントアクション change_status（grant/remove/lock/unlock）を追加するため
-- event_actions のCHECK制約を再構築（既存の0010/0011と同じ手順）。
CREATE TABLE event_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'character_join', 'character_leave', 'insert_dialogue', 'generate_image', 'set_flag',
      'change_relationship', 'change_outfit', 'advance_time', 'grant_item', 'remove_item', 'change_status'
    )
  ),
  params TEXT NOT NULL DEFAULT '{}',
  outcome TEXT NOT NULL DEFAULT 'always' CHECK (outcome IN ('always', 'success', 'failure'))
);
INSERT INTO event_actions_new (id, event_definition_id, action_type, params, outcome)
  SELECT id, event_definition_id, action_type, params, outcome FROM event_actions;
DROP TABLE event_actions;
ALTER TABLE event_actions_new RENAME TO event_actions;

-- 新規イベント条件 has_status を追加するため event_conditions も同様に再構築。
CREATE TABLE event_conditions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL CHECK (
    condition_type IN (
      'probability', 'turn_count', 'keyword', 'relationship_threshold', 'flag_state',
      'participant_count', 'has_item', 'llm_judge', 'has_status'
    )
  ),
  params TEXT NOT NULL DEFAULT '{}',
  phase TEXT NOT NULL DEFAULT 'trigger' CHECK (phase IN ('trigger', 'outcome'))
);
INSERT INTO event_conditions_new (id, event_definition_id, condition_type, params, phase)
  SELECT id, event_definition_id, condition_type, params, phase FROM event_conditions;
DROP TABLE event_conditions;
ALTER TABLE event_conditions_new RENAME TO event_conditions;
