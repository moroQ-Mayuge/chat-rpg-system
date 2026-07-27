-- 拾えるアイテムを「発見」制にする。
--
-- 0071で一覧を部屋の入手可能カテゴリから引くようにしたが、部屋に入った瞬間から
-- 中身が見えていた。@周辺や「しらべる」で探索して初めて何があるか分かる形に
-- するため、探索済みの部屋と、そこで拾える状態になったアイテムを持つ。

-- 探索済みの部屋。ルート内で永続するので、再入室のたびに調べ直さなくてよい。
CREATE TABLE playthrough_room_discoveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  discovered_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_playthrough_room_discoveries
  ON playthrough_room_discoveries(playthrough_id, room_template_id);

-- その部屋で拾える状態になったアイテム。発見時の抽選結果・LLMのITEM_GRANT・
-- イベントアクションのいずれもここに入る。抽選は発見時の1度きりで、以降その
-- 顔ぶれが常設される(「あの部屋にはあれがある」と覚えられる)ため永続。
-- 実際に拾える一覧は、これから room_session_picked_items(0071)で
-- このセッション中に拾った分を除いたもの。
CREATE TABLE playthrough_room_available_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_playthrough_room_available_items
  ON playthrough_room_available_items(playthrough_id, room_template_id, item_id);

-- 新アクション make_item_available を許可する。SQLiteはCHECK制約を
-- ALTERできないため、0063等と同じくテーブルを作り直す。
CREATE TABLE event_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'character_join', 'character_leave', 'insert_dialogue', 'generate_image', 'set_flag',
      'change_relationship', 'change_outfit', 'advance_time', 'grant_item', 'remove_item',
      'change_status', 'set_address', 'spend_money', 'set_scene_situation', 'grant_random_item',
      'set_character_impression', 'add_character_memory', 'make_item_available'
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
