import { db } from '../connection.js';

// Room-master level: broad candidate item categories a room can yield when
// the player investigates its surroundings (@周辺). Mirrors
// roomPropCategoriesRepo.js's shape exactly, but for item_categories.
export function listCandidateCategoriesForRoom(roomTemplateId) {
  return db
    .prepare(
      `SELECT ic.* FROM item_categories ic
       JOIN room_template_item_categories rtic ON rtic.item_category_id = ic.id
       WHERE rtic.room_template_id = ?
       ORDER BY ic.world_id IS NULL DESC, ic.name ASC`,
    )
    .all(roomTemplateId);
}

export function replaceCandidateCategoriesForRoom(roomTemplateId, categoryIds) {
  db.prepare('DELETE FROM room_template_item_categories WHERE room_template_id = ?').run(roomTemplateId);
  for (const categoryId of categoryIds ?? []) {
    db.prepare('INSERT INTO room_template_item_categories (room_template_id, item_category_id) VALUES (?, ?)').run(
      roomTemplateId,
      categoryId,
    );
  }
  return listCandidateCategoriesForRoom(roomTemplateId);
}
