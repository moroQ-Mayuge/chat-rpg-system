import { db } from '../connection.js';

// A World's effective item list is the common (world_id IS NULL) master plus
// its own additions — never other Worlds' items, so e.g. a modern-day
// setting never sees a fantasy World's "magic" items (chat enhancement
// backlog item 3, 2-tier scoping).
export function listItemsForWorld(worldId) {
  return db
    .prepare('SELECT * FROM items WHERE world_id IS NULL OR world_id = ? ORDER BY world_id IS NULL DESC, name ASC')
    .all(worldId);
}

export function listAllItems() {
  return db.prepare('SELECT * FROM items ORDER BY world_id IS NULL DESC, name ASC').all();
}

export function getItem(id) {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
}

export function createItem({ world_id, name, description, image_tags }) {
  const result = db
    .prepare('INSERT INTO items (world_id, name, description, image_tags) VALUES (?, ?, ?, ?)')
    .run(world_id ?? null, name, description ?? '', image_tags ?? '');
  return getItem(result.lastInsertRowid);
}

// Dynamic item generation (chat enhancement backlog item 9): the LLM can
// invent an item mid-conversation via [ITEM_GRANT: name]. Always scoped to
// the current room's own World (never world_id NULL / the shared-common
// tier) so an LLM-invented item can never leak into other Worlds the way a
// deliberately-curated common item can — matches the two-tier design's
// whole point of keeping e.g. fantasy items out of a modern setting.
// Find-or-create by exact name match so repeated grants of the same
// LLM-invented name reuse one item row instead of duplicating it.
export function findOrCreateWorldItem(worldId, name, description) {
  const existing = db.prepare('SELECT * FROM items WHERE world_id = ? AND name = ?').get(worldId, name);
  if (existing) return existing;
  return createItem({ world_id: worldId, name, description });
}

export function updateItem(id, { world_id, name, description, image_tags }) {
  db.prepare('UPDATE items SET world_id = ?, name = ?, description = ?, image_tags = ? WHERE id = ?').run(
    world_id ?? null,
    name,
    description ?? '',
    image_tags ?? '',
    id,
  );
  return getItem(id);
}

export function deleteItem(id) {
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  return { deleted: true };
}
