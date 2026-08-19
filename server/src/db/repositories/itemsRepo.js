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
        AND av.revealed = 1
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

// is_consumable は nullable な「カテゴリ設定の上書き」(0108): null なら
// item_categories.is_consumable に従う、1/0 でこのアイテム個別に決める。
export function createItem({ world_id, name, description, image_tags, category_id, buy_price, sell_price, outfit_master_id, is_consumable }) {
  const result = db
    .prepare(
      'INSERT INTO items (world_id, name, description, image_tags, category_id, buy_price, sell_price, outfit_master_id, is_consumable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      world_id ?? null,
      name,
      description ?? '',
      image_tags ?? '',
      category_id ?? null,
      buy_price ?? null,
      sell_price ?? null,
      outfit_master_id ?? null,
      is_consumable == null ? null : is_consumable ? 1 : 0,
    );
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
// isConsumable はクラフト時にLLMが完成品ごとに判定した消費型フラグ(null =
// 判定なし = カテゴリ設定に従う)。
//
// 既存行が未判定(NULL)のまま残っている場合だけ、今回の判定で埋める。同名の
// アイテムが先にITEM_GRANT等で作られていると、クラフトで判定が出ても永久に
// 反映されず「料理が消耗品扱いになったりならなかったり」する原因になっていた
// (実プレイでの指摘)。既に明示的な1/0が入っている行は上書きしない——
// アイテム画面での手動設定をLLMに壊させないため。
export function findOrCreateWorldItem(worldId, name, description, categoryId, isConsumable = null) {
  const existing = db.prepare('SELECT * FROM items WHERE world_id = ? AND name = ?').get(worldId, name);
  if (existing) {
    if (existing.is_consumable == null && isConsumable != null) {
      db.prepare('UPDATE items SET is_consumable = ? WHERE id = ?').run(isConsumable ? 1 : 0, existing.id);
      return getItem(existing.id);
    }
    return existing;
  }
  return createItem({ world_id: worldId, name, description, category_id: categoryId, is_consumable: isConsumable });
}

export function updateItem(id, { world_id, name, description, image_tags, category_id, buy_price, sell_price, outfit_master_id, is_consumable }) {
  db.prepare(
    'UPDATE items SET world_id = ?, name = ?, description = ?, image_tags = ?, category_id = ?, buy_price = ?, sell_price = ?, outfit_master_id = ?, is_consumable = ? WHERE id = ?',
  ).run(
    world_id ?? null,
    name,
    description ?? '',
    image_tags ?? '',
    category_id ?? null,
    buy_price ?? null,
    sell_price ?? null,
    outfit_master_id ?? null,
    is_consumable == null ? null : is_consumable ? 1 : 0,
    id,
  );
  return getItem(id);
}

export function deleteItem(id) {
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  return { deleted: true };
}
