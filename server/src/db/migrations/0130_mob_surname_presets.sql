-- モブのランダム名前(0129)に、苗字だけの独立プールを追加する。名前(下の名前)
-- ・苗字・ペルソナ(性格・口調)は互いに紐付かず、部屋登場時にそれぞれ別個に
-- 抽選して組み合わせる(片方/一部だけ欠けても構わない、0129と同じ設計方針)。

CREATE TABLE mob_surname_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  surname TEXT NOT NULL,
  is_generated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_mob_surname_presets_world ON mob_surname_presets(world_id);

-- 参加インスタンスが持つ「今回抽選された苗字」の参照列。名前(mob_flavor_name_id)
-- ・ペルソナ(mob_flavor_preset_id)とは独立に持つ。
ALTER TABLE room_session_characters ADD COLUMN mob_flavor_surname_id INTEGER REFERENCES mob_surname_presets(id);
