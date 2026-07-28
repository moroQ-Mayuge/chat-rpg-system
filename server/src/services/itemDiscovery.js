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
// revealed=1 は即公開(ITEM_GRANT・イベント経由)、0 は探索で1つずつ出す抽選分。
export function makeItemAvailable(playthroughId, roomTemplateId, itemId, revealed = true) {
  const existing = db
    .prepare(
      'SELECT 1 FROM playthrough_room_available_items WHERE playthrough_id = ? AND room_template_id = ? AND item_id = ?',
    )
    .get(playthroughId, roomTemplateId, itemId);
  if (existing) return null;
  db.prepare(
    'INSERT INTO playthrough_room_available_items (playthrough_id, room_template_id, item_id, revealed) VALUES (?, ?, ?, ?)',
  ).run(playthroughId, roomTemplateId, itemId, revealed ? 1 : 0);
  return getItem(itemId);
}

// 探索1回につき見つかるのは1つだけ。初回の探索でその部屋の顔ぶれ(3〜5件)を
// 抽選して未公開で仕込み、以降は調べるたびに1件ずつ公開していく。抽選自体は
// 1度きりなので、「あの部屋にはあれがある」は変わらない。
// 戻り値は今回見つかったアイテム(0件か1件) — 呼び出し側がそのぶん「見つけた」を出す。
export function exploreRoom(playthroughId, roomTemplateId) {
  stockRoomIfUndiscovered(playthroughId, roomTemplateId);

  const next = db
    .prepare(
      `SELECT item_id FROM playthrough_room_available_items
       WHERE playthrough_id = ? AND room_template_id = ? AND revealed = 0
       ORDER BY id ASC LIMIT 1`,
    )
    .get(playthroughId, roomTemplateId);
  if (!next) return [];

  db.prepare(
    'UPDATE playthrough_room_available_items SET revealed = 1 WHERE playthrough_id = ? AND room_template_id = ? AND item_id = ?',
  ).run(playthroughId, roomTemplateId, next.item_id);
  return [getItem(next.item_id)];
}

// 部屋の顔ぶれの抽選。未公開(revealed=0)で入れておき、exploreRoomが1つずつ
// 公開する。既に探索済みの部屋では何もしない。
function stockRoomIfUndiscovered(playthroughId, roomTemplateId) {
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

  return chosen.map((item) => makeItemAvailable(playthroughId, roomTemplateId, item.id, false)).filter(Boolean);
}
