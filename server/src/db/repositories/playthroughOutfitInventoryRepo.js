import { db } from '../connection.js';

// inventoryRepo.js の item_id 版。owner_character_id が NULL ならプレイヤー、
// という同じ規約。items を介さない衣装マスタ専用の所持テーブル
// (playthrough_outfit_inventory、0096) を対象にする以外はミラー。
export function listOutfitInventoryForPlaythrough(playthroughId, ownerCharacterId = null) {
  return db
    .prepare(
      `SELECT poi.*, om.name, om.slot, om.sell_price
       FROM playthrough_outfit_inventory poi
       JOIN outfit_masters om ON om.id = poi.outfit_master_id
       WHERE poi.playthrough_id = ? AND poi.owner_character_id IS ?
       ORDER BY poi.acquired_at DESC`,
    )
    .all(playthroughId, ownerCharacterId);
}

export function addOutfitToInventory(playthroughId, outfitMasterId, quantity = 1, ownerCharacterId = null) {
  const existing = db
    .prepare('SELECT * FROM playthrough_outfit_inventory WHERE playthrough_id = ? AND outfit_master_id = ? AND owner_character_id IS ?')
    .get(playthroughId, outfitMasterId, ownerCharacterId);

  if (existing) {
    db.prepare('UPDATE playthrough_outfit_inventory SET quantity = quantity + ? WHERE id = ?').run(quantity, existing.id);
    return db.prepare('SELECT * FROM playthrough_outfit_inventory WHERE id = ?').get(existing.id);
  }

  const result = db
    .prepare('INSERT INTO playthrough_outfit_inventory (playthrough_id, outfit_master_id, owner_character_id, quantity) VALUES (?, ?, ?, ?)')
    .run(playthroughId, outfitMasterId, ownerCharacterId, quantity);
  return db.prepare('SELECT * FROM playthrough_outfit_inventory WHERE id = ?').get(result.lastInsertRowid);
}

export function removeOutfitFromInventory(playthroughId, outfitMasterId, quantity = 1, ownerCharacterId = null) {
  const existing = db
    .prepare('SELECT * FROM playthrough_outfit_inventory WHERE playthrough_id = ? AND outfit_master_id = ? AND owner_character_id IS ?')
    .get(playthroughId, outfitMasterId, ownerCharacterId);
  if (!existing) return { removed: false, reason: 'not_held' };

  if (existing.quantity <= quantity) {
    db.prepare('DELETE FROM playthrough_outfit_inventory WHERE id = ?').run(existing.id);
  } else {
    db.prepare('UPDATE playthrough_outfit_inventory SET quantity = quantity - ? WHERE id = ?').run(quantity, existing.id);
  }
  return { removed: true };
}

// プレイヤー(owner NULL)からNPCへ移す、「渡す」の衣装版。
export function transferOutfitItem(playthroughId, outfitMasterId, quantity, toCharacterId) {
  const held = db
    .prepare('SELECT quantity FROM playthrough_outfit_inventory WHERE playthrough_id = ? AND outfit_master_id = ? AND owner_character_id IS NULL')
    .get(playthroughId, outfitMasterId);
  if (!held || held.quantity < quantity) return { transferred: false, reason: 'insufficient_quantity' };

  removeOutfitFromInventory(playthroughId, outfitMasterId, quantity, null);
  addOutfitToInventory(playthroughId, outfitMasterId, quantity, toCharacterId);
  return { transferred: true };
}

export function hasOutfit(playthroughId, outfitMasterId, ownerCharacterId = null) {
  const row = db
    .prepare('SELECT quantity FROM playthrough_outfit_inventory WHERE playthrough_id = ? AND outfit_master_id = ? AND owner_character_id IS ?')
    .get(playthroughId, outfitMasterId, ownerCharacterId);
  return Boolean(row && row.quantity > 0);
}
