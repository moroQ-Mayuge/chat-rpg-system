import { db } from '../db/connection.js';
import { getItem } from '../db/repositories/itemsRepo.js';
import { listCandidateCategoriesForRoom } from '../db/repositories/roomItemCategoriesRepo.js';

// 拾えるアイテムの「発見」まわり(0072)。部屋に入っただけでは何も見えず、
// @周辺や「しらべる」で探索して初めて中身が分かる。

// 発見時に常設化する件数。候補がこれ未満なら全件。
const MIN_DISCOVERED = 3;
const MAX_DISCOVERED = 5;

export function isRoomDiscovered(playthroughId, roomTemplateId) {
  return Boolean(
    db
      .prepare('SELECT 1 FROM playthrough_room_discoveries WHERE playthrough_id = ? AND room_template_id = ?')
      .get(playthroughId, roomTemplateId),
  );
}

// その部屋で拾える状態にする。既にavailableなら何もしない(nullを返す)ので、
// 呼び出し側は戻り値が非nullの時だけ「見つけた」を出せばよい。
export function makeItemAvailable(playthroughId, roomTemplateId, itemId) {
  const existing = db
    .prepare(
      'SELECT 1 FROM playthrough_room_available_items WHERE playthrough_id = ? AND room_template_id = ? AND item_id = ?',
    )
    .get(playthroughId, roomTemplateId, itemId);
  if (existing) return null;
  db.prepare(
    'INSERT INTO playthrough_room_available_items (playthrough_id, room_template_id, item_id) VALUES (?, ?, ?)',
  ).run(playthroughId, roomTemplateId, itemId);
  return getItem(itemId);
}

// 部屋を初めて探索した時の抽選。以降その顔ぶれが常設されるので、2回目以降の
// 探索では引き直さない(「あの部屋にはあれがある」と覚えられるようにするため)。
// 戻り値は新たに見つかったアイテム — 呼び出し側がその件数ぶん「見つけた」を出す。
export function discoverRoomItems(playthroughId, roomTemplateId) {
  if (isRoomDiscovered(playthroughId, roomTemplateId)) return [];

  db.prepare('INSERT INTO playthrough_room_discoveries (playthrough_id, room_template_id) VALUES (?, ?)').run(
    playthroughId,
    roomTemplateId,
  );

  const worldId = db.prepare('SELECT world_id FROM playthroughs WHERE id = ?').get(playthroughId)?.world_id;
  const categoryIds = listCandidateCategoriesForRoom(roomTemplateId).map((c) => c.id);
  if (categoryIds.length === 0) return [];

  // 抽選元はitemsの二層スコープ(共通＋自World)に従う — listItemsForWorldと同じ。
  const candidates = db
    .prepare(
      `SELECT * FROM items
       WHERE category_id IN (${categoryIds.map(() => '?').join(',')})
         AND (world_id IS NULL OR world_id = ?)`,
    )
    .all(...categoryIds, worldId);
  if (candidates.length === 0) return [];

  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const target = MIN_DISCOVERED + Math.floor(Math.random() * (MAX_DISCOVERED - MIN_DISCOVERED + 1));
  const chosen = shuffled.slice(0, Math.min(target, shuffled.length));

  return chosen.map((item) => makeItemAvailable(playthroughId, roomTemplateId, item.id)).filter(Boolean);
}
