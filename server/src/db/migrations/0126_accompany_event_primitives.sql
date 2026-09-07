-- 「同行を頼む/やめさせる」会話コマンドをイベントエンジンで実装するための
-- 汎用プリミティブ追加。SQLiteはCHECKをALTERできないため0101/0122と同じく
-- テーブルを作り直す（既存項目は変更せず、新項目を1つずつ追加するのみ）。

-- 条件 relationship_probability: 対象キャラの複数関係値軸のうち正規化値が
-- 最大の軸を確率として採用し判定する(信頼度/恋愛度/依存度のどれか高い方で可)。
CREATE TABLE event_conditions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL CHECK (
    condition_type IN (
      'probability', 'turn_count', 'keyword', 'relationship_threshold', 'flag_state',
      'participant_count', 'has_item', 'llm_judge', 'has_status', 'has_outfit', 'has_money',
      'has_pose', 'relationship_probability'
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

-- アクション set_accompanying: 対象キャラのis_accompanyingを直接設定する
-- (既存のsetAccompanying()をそのまま呼ぶだけ、新しい判定ロジックは持たない)。
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
      'set_pose', 'transform_character', 'end_session', 'set_accompanying'
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

-- 既定の会話コマンド2つ(共通、0107/0117と同じ書き方)。keyword_textが実際に
-- 送信される文言で、対応するevent_definitions(別途スクリプトで投入)のkeyword
-- 条件と一致させる。
INSERT INTO action_commands (world_id, label, icon, command_type, keyword_text, sort_order, category, subcategory)
VALUES
  (NULL, '同行を頼む', '🚶', 'keyword', '同行して', 1, '同行', ''),
  (NULL, '同行をやめさせる', '🛑', 'keyword', '同行をやめて', 2, '同行', '');

-- ChatPage.jsxの手動同行トグル(デバッグ用オーバーライド)の表示ON/OFF。
-- 既定ON=これまで常時表示だった挙動を維持する。
ALTER TABLE worlds ADD COLUMN debug_accompany_toggle_enabled INTEGER NOT NULL DEFAULT 1;
