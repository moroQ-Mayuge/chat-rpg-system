-- Item categories (chat enhancement backlog item 9 follow-up): whether an
-- item is consumable is now determined per-category rather than per-item,
-- so a World can classify a whole class of items ("消耗品" etc.) at once —
-- same common+World-specific 2-tier pattern as items themselves.
CREATE TABLE item_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_consumable INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE items ADD COLUMN category_id INTEGER REFERENCES item_categories(id);

-- Seed a common fallback category and backfill every existing item onto it,
-- so pre-existing data doesn't end up with a dangling NULL category.
INSERT INTO item_categories (world_id, name, is_consumable) VALUES (NULL, '未分類', 0);
UPDATE items SET category_id = (SELECT id FROM item_categories WHERE world_id IS NULL AND name = '未分類');
