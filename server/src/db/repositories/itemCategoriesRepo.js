import { db } from '../connection.js';

// Same common(world_id IS NULL) + World-specific 2-tier scoping as items.
export function listCategoriesForWorld(worldId) {
  return db
    .prepare('SELECT * FROM item_categories WHERE world_id IS NULL OR world_id = ? ORDER BY world_id IS NULL DESC, name ASC')
    .all(worldId);
}

export function listAllCategories() {
  return db.prepare('SELECT * FROM item_categories ORDER BY world_id IS NULL DESC, name ASC').all();
}

export function getCategory(id) {
  return db.prepare('SELECT * FROM item_categories WHERE id = ?').get(id);
}

// Exact-name lookup within a World's effective category list — used when
// resolving the category name an LLM picked for a dynamically-generated item.
export function findCategoryByName(worldId, name) {
  return db
    .prepare('SELECT * FROM item_categories WHERE (world_id IS NULL OR world_id = ?) AND name = ?')
    .get(worldId, name);
}

export function createCategory({ world_id, name, is_consumable }) {
  const result = db
    .prepare('INSERT INTO item_categories (world_id, name, is_consumable) VALUES (?, ?, ?)')
    .run(world_id ?? null, name, is_consumable ? 1 : 0);
  return getCategory(result.lastInsertRowid);
}

export function updateCategory(id, { world_id, name, is_consumable }) {
  db.prepare('UPDATE item_categories SET world_id = ?, name = ?, is_consumable = ? WHERE id = ?').run(
    world_id ?? null,
    name,
    is_consumable ? 1 : 0,
    id,
  );
  return getCategory(id);
}

export function deleteCategory(id) {
  db.prepare('DELETE FROM item_categories WHERE id = ?').run(id);
  return { deleted: true };
}
