ALTER TABLE outfit_masters ADD COLUMN slot TEXT NOT NULL DEFAULT 'normal' CHECK (slot IN ('normal', 'underwear'));
ALTER TABLE outfits ADD COLUMN overrides_underwear INTEGER NOT NULL DEFAULT 0;
ALTER TABLE characters ADD COLUMN underwear_preference_tags TEXT NOT NULL DEFAULT '';
ALTER TABLE worlds ADD COLUMN underwear_random_enabled INTEGER NOT NULL DEFAULT 0;

-- ルート単位で「今日装備している下着マスタ」を持つ。モブは relationship_states
-- ベースの列挙(既存のapplySelfStatRegenと同じidiom)から自然に外れるため、
-- このテーブル自体はモブ対応を持たない(仕様上の判断)。
CREATE TABLE playthrough_character_underwear (
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  outfit_master_id INTEGER REFERENCES outfit_masters(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (playthrough_id, character_id)
);
