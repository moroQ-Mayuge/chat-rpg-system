-- モブのランダムペルソナ(0127/0128)で「1プリセット=名前+性格+口調の一式」と
-- していたのを、名前とペルソナ(性格・口調)を独立プールに分離する。抽選時に
-- それぞれ別個にランダム選択して組み合わせる(名前だけ/ペルソナだけの片方欠け
-- も許容する)。

-- 名前専用プール(World単位)。既存mob_flavor_presets.nameをここへ複製する際、
-- idをそのまま引き継ぐ(=既存のroom_session_characters.mob_flavor_preset_idを
-- そのままmob_flavor_name_idにも流用できるようにするため)。
CREATE TABLE mob_name_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_generated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_mob_name_presets_world ON mob_name_presets(world_id);

INSERT INTO mob_name_presets (id, world_id, name, is_generated)
  SELECT id, world_id, name, is_generated FROM mob_flavor_presets;

-- mob_flavor_presetsからnameを除去し、純粋な「性格・口調」ペルソナプールにする。
-- room_session_characters.mob_flavor_preset_idがこのテーブルを参照しているため
-- (FK制約ON)、テーブル再作成ではなくDROP COLUMNで対応する
-- (better-sqlite3同梱のSQLiteは3.35+でDROP COLUMN対応済み)。
ALTER TABLE mob_flavor_presets DROP COLUMN name;

-- 参加インスタンスが持つ「今回抽選/生成された名前」の参照列。ペルソナ
-- (mob_flavor_preset_id)とは独立に持つ。
ALTER TABLE room_session_characters ADD COLUMN mob_flavor_name_id INTEGER REFERENCES mob_name_presets(id);

-- 既存に(数は少ないはずだが)mob_flavor_preset_idが設定済みの行があれば、
-- 同じidがmob_name_presets側にも複製されているため、そのままmob_flavor_name_id
-- としても引き継げる。
UPDATE room_session_characters SET mob_flavor_name_id = mob_flavor_preset_id WHERE mob_flavor_preset_id IS NOT NULL;
