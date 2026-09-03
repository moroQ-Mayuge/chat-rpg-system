-- 品揃えのランダム表示範囲。両方NULL(既定)なら現状どおり全件表示。
ALTER TABLE room_templates ADD COLUMN shop_lineup_min INTEGER;
ALTER TABLE room_templates ADD COLUMN shop_lineup_max INTEGER;
-- 更新単位。intervalが0なら単位に関わらず「見るたび毎回再抽選」(永続化しない)。
ALTER TABLE room_templates ADD COLUMN shop_lineup_refresh_unit TEXT NOT NULL DEFAULT 'turn'
  CHECK (shop_lineup_refresh_unit IN ('turn', 'time_slot', 'day'));
ALTER TABLE room_templates ADD COLUMN shop_lineup_refresh_interval INTEGER NOT NULL DEFAULT 0;

-- 実際に選ばれた品揃えの永続化(interval>0の時のみ使用)。kind='item'/'outfit'で
-- アイテムと衣装を別行として持つ(候補プールも再抽選タイミングの意味も別なため)。
-- outfit_acquisition_mode='shop'のoutfits側と'pickup'は同じ部屋で同時に有効に
-- ならないため、kind='outfit'の行はどちらの経路からでも安全に共有できる。
CREATE TABLE playthrough_shop_lineups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('item', 'outfit')),
  selected_ids TEXT NOT NULL,
  generated_at_day INTEGER NOT NULL,
  generated_at_absolute_slot INTEGER NOT NULL,
  generated_at_turn_count INTEGER NOT NULL,
  UNIQUE(playthrough_id, room_template_id, kind)
);
