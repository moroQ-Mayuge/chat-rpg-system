import { db } from '../connection.js';

// owner_character_id is nullable with NULL meaning "the player" — the only
// holder currently surfaced in the UI, but the column stays open for a
// future NPC-inventory extension without a schema change.
export function listInventoryForPlaythrough(playthroughId, ownerCharacterId = null) {
  return db
    .prepare(
      `SELECT pi.*, i.name, i.description, i.image_tags
       FROM playthrough_inventory pi
       JOIN items i ON i.id = pi.item_id
       WHERE pi.playthrough_id = ? AND pi.owner_character_id IS ?
       ORDER BY pi.acquired_at DESC`,
    )
    .all(playthroughId, ownerCharacterId);
}

export function addItemToInventory(playthroughId, itemId, quantity = 1, ownerCharacterId = null) {
  const existing = db
    .prepare('SELECT * FROM playthrough_inventory WHERE playthrough_id = ? AND item_id = ? AND owner_character_id IS ?')
    .get(playthroughId, itemId, ownerCharacterId);

  if (existing) {
    db.prepare('UPDATE playthrough_inventory SET quantity = quantity + ? WHERE id = ?').run(quantity, existing.id);
    return db.prepare('SELECT * FROM playthrough_inventory WHERE id = ?').get(existing.id);
  }

  const result = db
    .prepare('INSERT INTO playthrough_inventory (playthrough_id, item_id, owner_character_id, quantity) VALUES (?, ?, ?, ?)')
    .run(playthroughId, itemId, ownerCharacterId, quantity);
  return db.prepare('SELECT * FROM playthrough_inventory WHERE id = ?').get(result.lastInsertRowid);
}

// Removes `quantity` units, deleting the row entirely once it reaches zero
// (an inventory row with quantity 0 has no meaning — matches how the UI
// treats "used the last one" as no longer holding the item at all).
export function removeItemFromInventory(playthroughId, itemId, quantity = 1, ownerCharacterId = null) {
  const existing = db
    .prepare('SELECT * FROM playthrough_inventory WHERE playthrough_id = ? AND item_id = ? AND owner_character_id IS ?')
    .get(playthroughId, itemId, ownerCharacterId);
  if (!existing) return { removed: false, reason: 'not_held' };

  if (existing.quantity <= quantity) {
    db.prepare('DELETE FROM playthrough_inventory WHERE id = ?').run(existing.id);
  } else {
    db.prepare('UPDATE playthrough_inventory SET quantity = quantity - ? WHERE id = ?').run(quantity, existing.id);
  }
  return { removed: true };
}

export function hasItem(playthroughId, itemId, ownerCharacterId = null) {
  const row = db
    .prepare('SELECT quantity FROM playthrough_inventory WHERE playthrough_id = ? AND item_id = ? AND owner_character_id IS ?')
    .get(playthroughId, itemId, ownerCharacterId);
  return Boolean(row && row.quantity > 0);
}
