-- 継続セッション(0121)の区切り方を選べるようにする。
-- 既定'time_slot'=これまでどおり時間帯が変わったら区切る。
ALTER TABLE worlds ADD COLUMN session_boundary_mode TEXT NOT NULL DEFAULT 'time_slot'
  CHECK (session_boundary_mode IN ('time_slot', 'day', 'never'));
-- 時間帯/日モードで、会話の途中では区切らず次の移動時に区切る。
ALTER TABLE worlds ADD COLUMN session_boundary_defer_to_move INTEGER NOT NULL DEFAULT 0;
-- 1場面の最大ユーザーターン数(NULL=無制限)。超えても会話の途中では区切らず、
-- 次の移動時に区切る(session_boundary_defer_to_moveと同じ扱い)。
ALTER TABLE worlds ADD COLUMN session_max_turns INTEGER;

-- 追加トリガー(モードを問わず重ねられる)。
ALTER TABLE room_connections ADD COLUMN ends_session INTEGER NOT NULL DEFAULT 0;
ALTER TABLE room_templates ADD COLUMN ends_session_on_enter INTEGER NOT NULL DEFAULT 0;

-- セッションが今どの「ログ日」に居るか。日替わりの区切り行を入れた時だけ進む
-- (turns_per_time_slotがユーザー行挿入直後に暦を進めるため、暦そのものではなく
-- このマーカーで「日」の範囲を決める。switchRoomWithinSessionは意図的に触らない)。
ALTER TABLE room_sessions ADD COLUMN log_day INTEGER;
UPDATE room_sessions SET log_day = entered_day;
-- 保留中の区切り理由(''=なし / 'time_slot' / 'day' / 'max_turns' / 接続・部屋トリガー名)。
-- 次の/move・/exitで消費される。
ALTER TABLE room_sessions ADD COLUMN boundary_pending TEXT NOT NULL DEFAULT '';

-- メッセージが属するログ日(書き込み時にroom_sessions.log_dayを写す)。
ALTER TABLE messages ADD COLUMN game_day INTEGER;
UPDATE messages SET game_day = (
  SELECT rs.entered_day FROM room_sessions rs WHERE rs.id = messages.room_session_id
);
CREATE INDEX IF NOT EXISTS idx_messages_session_day ON messages(room_session_id, game_day);

-- event_actionsのCHECK拡張。SQLiteはCHECKをALTERできないため0100等と同じくテーブルを
-- 作り直す。end_session(場面を区切る)を追加。あわせて、registry.js・EventsPage.jsxには
-- 存在するのにCHECKに無かったtransform_characterも追加する(既知バグの修正)。
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
      'set_pose', 'transform_character', 'end_session'
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
