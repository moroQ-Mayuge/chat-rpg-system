-- サブ部屋(0150)のWorld別小物・設備(Stage 4)。既存の world_room_props/
-- world_room_free_props(親部屋全体の固定設備、0030)の主キーは変えず、サブ部屋
-- 専用の追加分を別テーブルに持つ——読み出し時に「親の小物＋サブ部屋の小物」を
-- 合算する(サブ部屋は親と別の場所ではなく、親の中の一角なので、親の備え付け
-- 設備は常に見える。プランの当初方針どおり)。
CREATE TABLE world_sub_room_props (
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  sub_room_id INTEGER NOT NULL REFERENCES room_sub_rooms(id) ON DELETE CASCADE,
  prop_id INTEGER NOT NULL REFERENCES props(id) ON DELETE CASCADE,
  PRIMARY KEY (world_id, sub_room_id, prop_id)
);
CREATE INDEX idx_world_sub_room_props_sub_room ON world_sub_room_props(sub_room_id);

CREATE TABLE world_sub_room_free_props (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  sub_room_id INTEGER NOT NULL REFERENCES room_sub_rooms(id) ON DELETE CASCADE,
  description TEXT NOT NULL
);
CREATE INDEX idx_world_sub_room_free_props_sub_room ON world_sub_room_free_props(sub_room_id, world_id);
