-- 衣装マスタ(共有定義)。outfitsから character_id・画像・is_default を除いた
-- 「定義」部分だけを持つ。Worldスコープは character_statuses と同じ多対多
-- (world_outfit_masters に行が無ければ共通)。実際にキャラ側から参照解決する
-- ロジックは実装順4で行う——ここでは器を作るだけ。
CREATE TABLE outfit_masters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  clothing_description TEXT NOT NULL DEFAULT '',
  equipment_description TEXT NOT NULL DEFAULT '',
  attribute_tags TEXT NOT NULL DEFAULT '',
  garment_operations TEXT NOT NULL DEFAULT '{}',
  main_features TEXT NOT NULL DEFAULT '',
  hairstyle TEXT NOT NULL DEFAULT '',
  clothing_main TEXT NOT NULL DEFAULT '',
  clothing_face TEXT NOT NULL DEFAULT '',
  clothing_upper TEXT NOT NULL DEFAULT '',
  clothing_lower TEXT NOT NULL DEFAULT '',
  clothing_legs TEXT NOT NULL DEFAULT '',
  shoes TEXT NOT NULL DEFAULT '',
  clothing_face_outer TEXT NOT NULL DEFAULT '',
  clothing_upper_outer TEXT NOT NULL DEFAULT '',
  clothing_lower_outer TEXT NOT NULL DEFAULT '',
  clothing_legs_outer TEXT NOT NULL DEFAULT '',
  clothing_face_equipment TEXT NOT NULL DEFAULT '',
  clothing_upper_equipment TEXT NOT NULL DEFAULT '',
  clothing_lower_equipment TEXT NOT NULL DEFAULT '',
  clothing_legs_equipment TEXT NOT NULL DEFAULT '',
  underwear_upper TEXT NOT NULL DEFAULT '',
  underwear_lower TEXT NOT NULL DEFAULT '',
  belongings TEXT NOT NULL DEFAULT ''
);

CREATE TABLE world_outfit_masters (
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  outfit_master_id INTEGER NOT NULL REFERENCES outfit_masters(id) ON DELETE CASCADE,
  PRIMARY KEY (world_id, outfit_master_id)
);

ALTER TABLE outfits ADD COLUMN outfit_master_id INTEGER REFERENCES outfit_masters(id) ON DELETE SET NULL;
ALTER TABLE outfits ADD COLUMN link_mode TEXT NOT NULL DEFAULT 'copy' CHECK (link_mode IN ('copy', 'reference'));
