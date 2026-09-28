-- サブ部屋: 1つの部屋(room_template)の中に複数の下位区画(カフェの窓際席/カウンター、
-- 商店街の各店舗など)を持たせる。親部屋にぶら下がる軽量な子で、空文字/NULLの項目は
-- 親(またはアクティブなroom_profile)の値を継承する。room_profiles(時間軸の切替)とは
-- 別物で、こちらは「同時に存在する空間の区画」。
--
-- 子の保存はroom_profilesと同じ全置換規約だが、idを維持して同期する(roomSubRoomsRepo.js)。
-- room_sessions.sub_room_id が子を参照するため、参照列は最初から ON DELETE SET NULL
-- (0147の「使用済みプリセット削除不可」FK不具合の再発防止と同じ方針)。
CREATE TABLE room_sub_rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- 入室時の初期位置。親部屋に高々1件(保存時に先頭以外を落とす)。0件なら親部屋本体(NULL)から始まる。
  is_default INTEGER NOT NULL DEFAULT 0,
  location_text TEXT NOT NULL DEFAULT '',
  atmosphere_text TEXT NOT NULL DEFAULT '',
  location_tags TEXT,
  atmosphere_tags TEXT,
  background_image_path TEXT,
  -- このサブ部屋へ移る時にplaythroughsRepo.applyMovementCostへ渡す移動コスト。0なら時間は進まない。
  enter_movement_cost INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_room_sub_rooms_room ON room_sub_rooms(room_template_id);

-- プレイヤーの現在位置。NULL=親部屋本体(サブ部屋に入る前の「メイン」)。
ALTER TABLE room_sessions ADD COLUMN sub_room_id INTEGER REFERENCES room_sub_rooms(id) ON DELETE SET NULL;
