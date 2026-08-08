-- 衣装マスタ自体を売買可能にする(itemsテーブルを介さない専用の小さな経済)。
-- NULL = 非売品、itemsのbuy_price/sell_priceと同じ規約。
ALTER TABLE outfit_masters ADD COLUMN buy_price INTEGER;
ALTER TABLE outfit_masters ADD COLUMN sell_price INTEGER;

-- playthrough_inventoryのitem_id版。item_idをoutfit_master_idに置き換えただけの同形。
CREATE TABLE playthrough_outfit_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  outfit_master_id INTEGER NOT NULL REFERENCES outfit_masters(id) ON DELETE CASCADE,
  owner_character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now'))
);
