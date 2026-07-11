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

// Used by dynamic item generation ([ITEM_GRANT: name|category]): resolves
// the LLM-chosen category name against this World's effective list, falling
// back to the common "未分類" seed category if the name is missing or
// doesn't match anything (LLM omitted it, typo'd it, or invented one that
// isn't in the list it was shown) — matches this codebase's established
// unmatched-reference fallback convention (e.g. JSON import, character_join).
export function resolveCategoryOrFallback(worldId, categoryName) {
  const matched = categoryName ? findCategoryByName(worldId, categoryName) : null;
  if (matched) return matched;
  return db.prepare("SELECT * FROM item_categories WHERE world_id IS NULL AND name = '未分類'").get();
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
