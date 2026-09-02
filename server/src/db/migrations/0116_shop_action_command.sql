-- command_type の CHECK 制約に 'shop' を追加するため、0106と同じ
-- copy-drop-rename でテーブルを再構築する(SQLiteはCHECKを直接ALTERできない)。
CREATE TABLE action_commands_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  command_type TEXT NOT NULL CHECK (command_type IN ('keyword', 'item_pickup', 'item_check', 'item_use', 'item_wear', 'transform_request', 'free_text', 'craft', 'shop')),
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
INSERT INTO action_commands_new
  (id, world_id, label, icon, command_type, keyword_text, sort_order, consumes_item, transfers_to_target,
   category, subcategory, sub_subcategory, visible_when_status_ids, visible_when_room_template_ids,
   disturbance_target_field, disturbance_target_style)
  SELECT id, world_id, label, icon, command_type, keyword_text, sort_order, consumes_item, transfers_to_target,
         category, subcategory, sub_subcategory, visible_when_status_ids, visible_when_room_template_ids,
         disturbance_target_field, disturbance_target_style
  FROM action_commands;
DROP TABLE action_commands;
ALTER TABLE action_commands_new RENAME TO action_commands;
