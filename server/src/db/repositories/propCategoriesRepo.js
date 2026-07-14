import { db } from '../connection.js';

// Same common(world_id IS NULL) + World-specific 2-tier scoping as
// item_categories (itemCategoriesRepo.js) -- but props get their own
// independent category system, not a shared/merged one.
export function listCategoriesForWorld(worldId) {
  return db
    .prepare('SELECT * FROM prop_categories WHERE world_id IS NULL OR world_id = ? ORDER BY world_id IS NULL DESC, name ASC')
    .all(worldId);
}

export function listAllCategories() {
  return db.prepare('SELECT * FROM prop_categories ORDER BY world_id IS NULL DESC, name ASC').all();
}

export function getCategory(id) {
  return db.prepare('SELECT * FROM prop_categories WHERE id = ?').get(id);
}

export function findCategoryByName(worldId, name) {
  return db
    .prepare('SELECT * FROM prop_categories WHERE (world_id IS NULL OR world_id = ?) AND name = ?')
    .get(worldId, name);
}

export function resolveCategoryOrFallback(worldId, categoryName) {
  const matched = categoryName ? findCategoryByName(worldId, categoryName) : null;
  if (matched) return matched;
  return db.prepare("SELECT * FROM prop_categories WHERE world_id IS NULL AND name = '未分類'").get();
}

export function createCategory({ world_id, name }) {
  const result = db.prepare('INSERT INTO prop_categories (world_id, name) VALUES (?, ?)').run(world_id ?? null, name);
  return getCategory(result.lastInsertRowid);
}

export function updateCategory(id, { world_id, name }) {
  db.prepare('UPDATE prop_categories SET world_id = ?, name = ? WHERE id = ?').run(world_id ?? null, name, id);
  return getCategory(id);
}

export function deleteCategory(id) {
  db.prepare('DELETE FROM prop_categories WHERE id = ?').run(id);
  return { deleted: true };
}
