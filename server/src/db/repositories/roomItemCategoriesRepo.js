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

// サブ部屋(0150、Stage 3)の候補カテゴリ上書き。行が1件もなければ親を継承——
// 「この店は食料しか置かない」のような完全上書きを表現するため、部屋本体と同じ
// 「行なし＝制限なし」ではなく「行なし＝親のカテゴリをそのまま使う」という規約。
export function listCandidateCategoriesForSubRoom(subRoomId) {
  return db
    .prepare(
      `SELECT ic.* FROM item_categories ic
       JOIN room_sub_room_item_categories rsic ON rsic.item_category_id = ic.id
       WHERE rsic.sub_room_id = ?
       ORDER BY ic.world_id IS NULL DESC, ic.name ASC`,
    )
    .all(subRoomId);
}

export function replaceCandidateCategoriesForSubRoom(subRoomId, categoryIds) {
  db.prepare('DELETE FROM room_sub_room_item_categories WHERE sub_room_id = ?').run(subRoomId);
  for (const categoryId of categoryIds ?? []) {
    db.prepare('INSERT INTO room_sub_room_item_categories (sub_room_id, item_category_id) VALUES (?, ?)').run(
      subRoomId,
      categoryId,
    );
  }
  return listCandidateCategoriesForSubRoom(subRoomId);
}

// サブ部屋があればその候補(上書き)、無ければ親部屋のものを返す。
// listShopProducts/exploreRoom/promptBuilder.jsが共通で使う解決窓口。
export function resolveEffectiveCandidateItemCategories(roomTemplateId, subRoomId) {
  if (subRoomId != null) {
    const subCategories = listCandidateCategoriesForSubRoom(subRoomId);
    if (subCategories.length > 0) return subCategories;
  }
  return listCandidateCategoriesForRoom(roomTemplateId);
}
