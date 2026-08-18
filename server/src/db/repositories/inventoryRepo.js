import { db } from '../connection.js';

// owner_character_id is nullable with NULL meaning "the player" — the only
// holder currently surfaced in the UI, but the column stays open for a
// future NPC-inventory extension without a schema change.
export function listInventoryForPlaythrough(playthroughId, ownerCharacterId = null) {
  return db
    .prepare(
      `SELECT pi.*, i.name, i.description, i.image_tags, i.category_id, i.sell_price, i.outfit_master_id,
              COALESCE(i.is_consumable, ic.is_consumable, 0) AS is_consumable
       FROM playthrough_inventory pi
       JOIN items i ON i.id = pi.item_id
       LEFT JOIN item_categories ic ON ic.id = i.category_id
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

// Moves `quantity` units from the player's own inventory (owner_character_id
// NULL) to a specific NPC's holding — the "渡す" counterpart to "使う".
// Fails loudly (rather than silently no-op'ing) if the player doesn't
// actually hold enough, since a transfer that silently does nothing would
// be confusing for a chat action the player explicitly took.
export function transferItem(playthroughId, itemId, quantity, toCharacterId) {
  const held = db
    .prepare('SELECT quantity FROM playthrough_inventory WHERE playthrough_id = ? AND item_id = ? AND owner_character_id IS NULL')
    .get(playthroughId, itemId);
  if (!held || held.quantity < quantity) return { transferred: false, reason: 'insufficient_quantity' };

  removeItemFromInventory(playthroughId, itemId, quantity, null);
  addItemToInventory(playthroughId, itemId, quantity, toCharacterId);
  return { transferred: true };
}

export function hasItem(playthroughId, itemId, ownerCharacterId = null) {
  const row = db
    .prepare('SELECT quantity FROM playthrough_inventory WHERE playthrough_id = ? AND item_id = ? AND owner_character_id IS ?')
    .get(playthroughId, itemId, ownerCharacterId);
  return Boolean(row && row.quantity > 0);
}

// hasItemの「持っているかどうか」ではなく実数が要るケース向け(クラフトの
// 「N個以上持っているか」検証など)。
export function getHeldQuantity(playthroughId, itemId, ownerCharacterId = null) {
  const row = db
    .prepare('SELECT quantity FROM playthrough_inventory WHERE playthrough_id = ? AND item_id = ? AND owner_character_id IS ?')
    .get(playthroughId, itemId, ownerCharacterId);
  return row?.quantity ?? 0;
}
