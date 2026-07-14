import { db } from '../connection.js';

// Room-master level: broad candidate prop categories (not specific prop
// instances) -- the World-level room instance picks actual props from
// whichever of these categories are registered here (worldRoomPropsRepo.js).
export function listCandidateCategoriesForRoom(roomTemplateId) {
  return db
    .prepare(
      `SELECT pc.* FROM prop_categories pc
       JOIN room_template_prop_categories rtpc ON rtpc.prop_category_id = pc.id
       WHERE rtpc.room_template_id = ?
       ORDER BY pc.world_id IS NULL DESC, pc.name ASC`,
    )
    .all(roomTemplateId);
}

export function replaceCandidateCategoriesForRoom(roomTemplateId, categoryIds) {
  db.prepare('DELETE FROM room_template_prop_categories WHERE room_template_id = ?').run(roomTemplateId);
  for (const categoryId of categoryIds ?? []) {
    db.prepare('INSERT INTO room_template_prop_categories (room_template_id, prop_category_id) VALUES (?, ?)').run(
      roomTemplateId,
      categoryId,
    );
  }
  return listCandidateCategoriesForRoom(roomTemplateId);
}
