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

// What the 拾う panel offers right now: whatever has actually been found in
// this room (playthrough_room_available_items — stocked by exploring the room,
// by ITEM_GRANT, or by an event), minus anything already picked up this
// session (0071). A room nobody has explored yet offers nothing, which is the
// point: the player has to look around first. The stock itself is permanent,
// so picking something up only hides it until the next visit.
export function listPickupItemsForSession(roomSessionId) {
  return db
    .prepare(
      `SELECT i.* FROM items i
       JOIN room_sessions rs ON rs.id = @sessionId
       JOIN playthrough_room_available_items av
         ON av.playthrough_id = rs.playthrough_id
        AND av.room_template_id = rs.room_template_id
        AND av.item_id = i.id
       WHERE NOT EXISTS (
           SELECT 1 FROM room_session_picked_items pi
           WHERE pi.room_session_id = @sessionId AND pi.item_id = i.id
         )
       ORDER BY i.world_id IS NULL DESC, i.name ASC`,
    )
    .all({ sessionId: roomSessionId });
}

export function markItemPickedUp(roomSessionId, itemId) {
  db.prepare('INSERT INTO room_session_picked_items (room_session_id, item_id) VALUES (?, ?)').run(roomSessionId, itemId);
}

export function getItem(id) {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id);
}

export function createItem({ world_id, name, description, image_tags, category_id, buy_price, sell_price }) {
  const result = db
    .prepare(
      'INSERT INTO items (world_id, name, description, image_tags, category_id, buy_price, sell_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(world_id ?? null, name, description ?? '', image_tags ?? '', category_id ?? null, buy_price ?? null, sell_price ?? null);
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
export function findOrCreateWorldItem(worldId, name, description, categoryId) {
  const existing = db.prepare('SELECT * FROM items WHERE world_id = ? AND name = ?').get(worldId, name);
  if (existing) return existing;
  return createItem({ world_id: worldId, name, description, category_id: categoryId });
}

export function updateItem(id, { world_id, name, description, image_tags, category_id, buy_price, sell_price }) {
  db.prepare(
    'UPDATE items SET world_id = ?, name = ?, description = ?, image_tags = ?, category_id = ?, buy_price = ?, sell_price = ? WHERE id = ?',
  ).run(world_id ?? null, name, description ?? '', image_tags ?? '', category_id ?? null, buy_price ?? null, sell_price ?? null, id);
  return getItem(id);
}

export function deleteItem(id) {
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  return { deleted: true };
}
