-- 0133で追加した「呼び出す」コマンドは@メンションでターゲットを渡す前提だったが、
-- @メンションのチップは今の部屋の参加者からしか作られない(client/src/pages/ChatPage.jsx)
-- ため、そもそも「今この場にいない人」を指定する手段が無かった(呼び出し機能の
-- 本来の対象そのもの)。command_typeに専用の対象選択パネル用の値を追加し、
-- 「呼び出す」コマンドをkeywordからそちらへ切り替える。パネル側は
-- POST /room-sessions/:id/messages の explicit_mention_ids で対象キャラidを
-- 直接渡すため、keyword_textは引き続き送信文言の組み立てにのみ使う。
CREATE TABLE action_commands_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  command_type TEXT NOT NULL CHECK (command_type IN ('keyword', 'item_pickup', 'item_check', 'item_use', 'item_wear', 'transform_request', 'free_text', 'craft', 'shop', 'call_character')),
  keyword_text TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  consumes_item INTEGER NOT NULL DEFAULT 0,
  transfers_to_target INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT '',
  subcategory TEXT NOT NULL DEFAULT '',
  sub_subcategory TEXT NOT NULL DEFAULT '',
  visible_when_status_ids TEXT NOT NULL DEFAULT '',
  visible_when_room_template_ids TEXT NOT NULL DEFAULT '',
  disturbance_target_field TEXT NOT NULL DEFAULT '',
  disturbance_target_style TEXT NOT NULL DEFAULT ''
);
INSERT INTO action_commands_new SELECT * FROM action_commands;
DROP TABLE action_commands;
ALTER TABLE action_commands_new RENAME TO action_commands;

UPDATE action_commands SET command_type = 'call_character' WHERE keyword_text = '呼び出して' AND category = '連絡先';

-- 呼び出し対象は「今この場にいない」のが本来のケースであり、その場合
-- promptBuilder.jsのキャラカード生成ループは参加者しか回さないため
-- outcome_success/failure_hint_textは実質効かない(対象が既に居合わせていた
-- 場合にのみ働く副次的な経路として残す)。到着の告知はcharacter_joinが
-- 自前でDB参照して行う{character_name}置換のentrance_narrationに任せる。
UPDATE event_actions SET params = '{"selection_mode":"specific","character_id":"mentioned","require_attribute_match":false,"entrance_narration":"{character_name}が呼びかけに応じてやってきた。"}'
WHERE action_type = 'character_join' AND event_definition_id = (SELECT id FROM event_definitions WHERE name = '呼び出す');

-- 失敗時に何も起きないと、呼び出しコマンド自体が失敗したのか単に応答が
-- 無かっただけなのか区別が付かないため、固定のナレーションで明示する。
-- ${target1}(placeholderResolution.js)は参加者限定の解決のため対象が不在だと
-- 空文字になってしまうので、名前を含めない文言にする。
INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT id, 'insert_dialogue', '{"mode":"fixed","character_id":null,"text":"呼びかけには応じてもらえなかったようだ。"}', 'failure'
FROM event_definitions WHERE name = '呼び出す';
