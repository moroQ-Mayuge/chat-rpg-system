-- サブ部屋(0150)専用のイベントプリミティブ(Stage 6)。
--
-- 条件 in_sub_room: 現在のプレイヤー位置(room_sessions.sub_room_id)が指定した
-- サブ部屋か(またはsub_room_id未指定=親部屋本体か)を判定する。
-- アクション set_sub_room: 現在のセッションのサブ部屋位置を強制的に切り替える
-- (set_room_profileと違い対象は常に「今このイベントが動いているセッション」
-- 自身——サブ部屋位置はroom_sessionsのライブな状態であり、room_profileのような
-- 「まだ入っていない部屋への予約」という概念が無いため)。
CREATE TABLE event_conditions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL CHECK (
    condition_type IN (
      'probability', 'turn_count', 'keyword', 'relationship_threshold', 'flag_state',
      'participant_count', 'has_item', 'llm_judge', 'has_status', 'has_outfit', 'has_money',
      'has_pose', 'relationship_probability', 'in_sub_room'
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

CREATE TABLE event_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'character_join', 'character_leave', 'insert_dialogue', 'generate_image', 'set_flag',
      'change_relationship', 'change_outfit', 'advance_time', 'grant_item', 'remove_item',
      'change_status', 'set_address', 'spend_money', 'set_scene_situation', 'grant_random_item',
      'set_character_impression', 'add_character_memory', 'make_item_available',
      'conceive', 'end_pregnancy', 'set_timer', 'clear_timer', 'time_skip', 'force_room_transfer',
      'set_pose', 'transform_character', 'end_session', 'set_accompanying', 'promote_mob_to_favorite',
      'set_room_profile', 'clear_room_profile', 'set_sub_room'
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

-- action_commands.visible_when_sub_room_ids: 既存visible_when_room_template_ids
-- と同形式(カンマ区切りid、クライアント側判定)。CHECK制約は絡まない単純な列
-- なので、event_*と違いテーブル再構築は不要。
ALTER TABLE action_commands ADD COLUMN visible_when_sub_room_ids TEXT NOT NULL DEFAULT '';
