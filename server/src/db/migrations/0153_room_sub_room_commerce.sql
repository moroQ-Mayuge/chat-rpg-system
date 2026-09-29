-- サブ部屋(0150)の商取引まわりの上書き(Stage 3、用途B「商店街」: 店ごとに
-- 購入内容が違う)。NULL/空文字は「親(room_templates)を継承」——他のサブ部屋
-- フィールド(location_text等)と同じ規約。
ALTER TABLE room_sub_rooms ADD COLUMN is_shop INTEGER; -- NULL=継承, 0/1=上書き
ALTER TABLE room_sub_rooms ADD COLUMN outfit_acquisition_mode TEXT
  CHECK (outfit_acquisition_mode IS NULL OR outfit_acquisition_mode IN ('none', 'shop', 'pickup'));
ALTER TABLE room_sub_rooms ADD COLUMN outfit_attribute_tags TEXT; -- NULL/空=継承
ALTER TABLE room_sub_rooms ADD COLUMN shop_lineup_min INTEGER; -- NULL=継承(各項目は独立に継承/上書き)
ALTER TABLE room_sub_rooms ADD COLUMN shop_lineup_max INTEGER;
ALTER TABLE room_sub_rooms ADD COLUMN shop_lineup_refresh_unit TEXT
  CHECK (shop_lineup_refresh_unit IS NULL OR shop_lineup_refresh_unit IN ('turn', 'time_slot', 'day'));
ALTER TABLE room_sub_rooms ADD COLUMN shop_lineup_refresh_interval INTEGER; -- NULL=継承

-- アイテムカテゴリの上書き。行が1件もなければ親(room_template_item_categories)を
-- そのまま継承、1件でもあればサブ部屋側のみを使う(部分追加ではなく完全上書き
-- ——「この店は食料しか置かない」を表現できるようにするため)。
CREATE TABLE room_sub_room_item_categories (
  sub_room_id INTEGER NOT NULL REFERENCES room_sub_rooms(id) ON DELETE CASCADE,
  item_category_id INTEGER NOT NULL REFERENCES item_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (sub_room_id, item_category_id)
);

-- 探索・品揃えの永続化キャッシュ3種にサブ部屋の次元を足す。room_sessions.sub_room_id
-- と違い「NULL=メイン」ではなく sub_room_id=0 を「親直下」の番兵値として使う——
-- これらのテーブルはUNIQUE制約でキャッシュ行の同一性を判定しており、SQLiteの
-- UNIQUE制約はNULL同士を別物として扱う(NULLはいくつでも重複挿入できてしまう)ため、
-- ON CONFLICTによる「無ければ挿入・あれば更新」が壊れる。0は有効なroom_sub_rooms.idに
-- 決してならない(AUTOINCREMENTは1から始まる)ので、番兵として安全に使える。
-- 制約の形を変える必要があるため、3つともテーブル再構築で作り直す(0071の
-- event_actions再構築と同じ手順)。

CREATE TABLE playthrough_room_discoveries_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  sub_room_id INTEGER NOT NULL DEFAULT 0,
  discovered_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO playthrough_room_discoveries_new (id, playthrough_id, room_template_id, discovered_at)
  SELECT id, playthrough_id, room_template_id, discovered_at FROM playthrough_room_discoveries;
DROP TABLE playthrough_room_discoveries;
ALTER TABLE playthrough_room_discoveries_new RENAME TO playthrough_room_discoveries;
CREATE UNIQUE INDEX idx_playthrough_room_discoveries
  ON playthrough_room_discoveries(playthrough_id, room_template_id, sub_room_id);

CREATE TABLE playthrough_room_available_items_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  sub_room_id INTEGER NOT NULL DEFAULT 0,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  revealed INTEGER NOT NULL DEFAULT 1
);
INSERT INTO playthrough_room_available_items_new (id, playthrough_id, room_template_id, item_id, added_at, revealed)
  SELECT id, playthrough_id, room_template_id, item_id, added_at, revealed FROM playthrough_room_available_items;
DROP TABLE playthrough_room_available_items;
ALTER TABLE playthrough_room_available_items_new RENAME TO playthrough_room_available_items;
CREATE UNIQUE INDEX idx_playthrough_room_available_items
  ON playthrough_room_available_items(playthrough_id, room_template_id, sub_room_id, item_id);

CREATE TABLE playthrough_shop_lineups_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  sub_room_id INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL CHECK (kind IN ('item', 'outfit')),
  selected_ids TEXT NOT NULL,
  generated_at_day INTEGER NOT NULL,
  generated_at_absolute_slot INTEGER NOT NULL,
  generated_at_turn_count INTEGER NOT NULL,
  UNIQUE(playthrough_id, room_template_id, sub_room_id, kind)
);
INSERT INTO playthrough_shop_lineups_new
    (id, playthrough_id, room_template_id, kind, selected_ids, generated_at_day, generated_at_absolute_slot, generated_at_turn_count)
  SELECT id, playthrough_id, room_template_id, kind, selected_ids, generated_at_day, generated_at_absolute_slot, generated_at_turn_count
  FROM playthrough_shop_lineups;
DROP TABLE playthrough_shop_lineups;
ALTER TABLE playthrough_shop_lineups_new RENAME TO playthrough_shop_lineups;
