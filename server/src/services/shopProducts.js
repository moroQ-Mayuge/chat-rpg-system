import { db } from '../db/connection.js';
import { listCandidateCategoriesForRoom } from '../db/repositories/roomItemCategoriesRepo.js';
import { listItemsForWorld } from '../db/repositories/itemsRepo.js';
import { listMastersForWorld } from '../db/repositories/outfitMastersRepo.js';
import { getRoomTemplate } from '../db/repositories/roomTemplatesRepo.js';
import { getWorld } from '../db/repositories/worldsRepo.js';
import { countUserTurnsForPlaythrough } from '../db/repositories/messagesRepo.js';
import { parseAttributeTags, tagsOverlap } from './attributeTagMatching.js';

// [itemDiscovery.js]のstockRoomIfUndiscoveredと同じシャッフル+スライスの作法。
// min/maxが未設定ならプールをそのまま返す(=既存の全件表示のまま)。
function pickRandomSubset(pool, min, max) {
  if (min == null || max == null) return pool;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const target = min + Math.floor(Math.random() * (Math.max(max, min) - min + 1));
  return shuffled.slice(0, Math.min(target, shuffled.length));
}

function currentCheckpointValues(playthroughId, worldId) {
  const playthrough = db.prepare('SELECT current_day, current_time_slot_index FROM playthroughs WHERE id = ?').get(playthroughId);
  const world = getWorld(worldId);
  const slotsPerDay = world.time_slot_labels.length || 1;
  return {
    day: playthrough.current_day,
    absoluteSlot: (playthrough.current_day - 1) * slotsPerDay + playthrough.current_time_slot_index,
    turnCount: countUserTurnsForPlaythrough(playthroughId),
  };
}

function elapsedSince(unit, saved, current) {
  if (unit === 'day') return current.day - saved.generated_at_day;
  if (unit === 'time_slot') return current.absoluteSlot - saved.generated_at_absolute_slot;
  return current.turnCount - saved.generated_at_turn_count;
}

// 品揃えのランダム抽選+永続化(playthrough_shop_lineups、0120)を一括で担う。
// min/max未設定なら現状どおり全件。refresh_interval=0なら永続化せず毎回
// その場で再抽選(今までのステートレスな挙動と同じ延長)。interval>0の時だけ、
// 設定した単位(ターン/時間帯/日)で経過を判定し、経過が足りなければ前回の
// 選出結果(pool内でまだ存在するものだけ)を使い回す。
// pool: idを持つオブジェクトの配列。room: getRoomTemplateの戻り値。
function resolveLineup(playthroughId, worldId, roomTemplateId, kind, pool, room) {
  const min = room?.shop_lineup_min;
  const max = room?.shop_lineup_max;
  if (min == null || max == null) return pool;

  const interval = room?.shop_lineup_refresh_interval ?? 0;
  if (interval <= 0) return pickRandomSubset(pool, min, max);

  const current = currentCheckpointValues(playthroughId, worldId);
  const saved = db
    .prepare('SELECT * FROM playthrough_shop_lineups WHERE playthrough_id = ? AND room_template_id = ? AND kind = ?')
    .get(playthroughId, roomTemplateId, kind);

  if (saved && elapsedSince(room.shop_lineup_refresh_unit, saved, current) < interval) {
    const selectedIds = new Set(JSON.parse(saved.selected_ids));
    const stillEligible = pool.filter((entry) => selectedIds.has(entry.id));
    // 選出済みが削除等で全部プールから消えていない限り、抽選し直さずそのまま使う。
    if (stillEligible.length > 0) return stillEligible;
  }

  const chosen = pickRandomSubset(pool, min, max);
  db.prepare(
    `INSERT INTO playthrough_shop_lineups
       (playthrough_id, room_template_id, kind, selected_ids, generated_at_day, generated_at_absolute_slot, generated_at_turn_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (playthrough_id, room_template_id, kind) DO UPDATE SET
       selected_ids = excluded.selected_ids,
       generated_at_day = excluded.generated_at_day,
       generated_at_absolute_slot = excluded.generated_at_absolute_slot,
       generated_at_turn_count = excluded.generated_at_turn_count`,
  ).run(
    playthroughId,
    roomTemplateId,
    kind,
    JSON.stringify(chosen.map((entry) => entry.id)),
    current.day,
    current.absoluteSlot,
    current.turnCount,
  );
  return chosen;
}

// LLM向けの買い物モードプロンプト(promptBuilder.js)とUI(ShopPanel)の両方から
// 同じ商品リストを引くための共通ロジック。片方だけ更新すると「UIでは買えるのに
// 会話では売っていないと言われる」ような食い違いが起きるため、必ずここを経由する。
//
// アイテム: そのWorldの、room_template_item_categoriesで絞った候補カテゴリに
// 属し、buy_priceが設定されているもの(既存ロジックをそのまま移設)。
// 衣装: そのWorldで使える衣装マスタのうち、buy_priceが設定されていて
// is_not_for_saleでなく、部屋のoutfit_attribute_tagsと一致するもの。
// outfit_attribute_tagsが空なら絞り込み無し(全て対象)。
// 両方とも、部屋のshop_lineup_min/max/refresh_*設定に基づきresolveLineupで
// ランダムな一部だけに絞られる(未設定なら従来どおり全件)。
export function listShopProducts(worldId, roomTemplateId, playthroughId) {
  const room = getRoomTemplate(roomTemplateId);
  const roomCandidateItemCategories = listCandidateCategoriesForRoom(roomTemplateId);

  const eligibleItems = listItemsForWorld(worldId).filter(
    (i) =>
      i.buy_price != null &&
      (roomCandidateItemCategories.length === 0 || roomCandidateItemCategories.some((c) => c.id === i.category_id)),
  );

  const requiredOutfitTags = parseAttributeTags(room?.outfit_attribute_tags);
  const eligibleOutfits = listMastersForWorld(worldId).filter(
    (m) =>
      m.buy_price != null &&
      !m.is_not_for_sale &&
      (requiredOutfitTags.length === 0 || tagsOverlap(parseAttributeTags(m.attribute_tags), requiredOutfitTags)),
  );

  return {
    items: resolveLineup(playthroughId, worldId, roomTemplateId, 'item', eligibleItems, room),
    outfits: resolveLineup(playthroughId, worldId, roomTemplateId, 'outfit', eligibleOutfits, room),
  };
}

// 'pickup'部屋(衣裳部屋など)向け: 価格は問わず、is_not_for_saleと属性キーだけで
// 絞る。買い物のような対価が無いため、buy_priceの有無はここでは無関係
// (10000/500の一括補完でほぼ全衣装にbuy_priceが付いているが、pickupの可否とは
// 別の話——非売品フラグだけが両経路に共通の除外条件)。
// 品揃えのランダム化はlistShopProductsのoutfits側と同じ設定・同じ永続化行
// (kind='outfit')を共有する——1部屋のoutfit_acquisition_modeは"shop"か
// "pickup"のどちらか一方でしか有効にならないため、同時に競合しない。
export function listPickupableOutfits(worldId, roomTemplateId, playthroughId) {
  const room = getRoomTemplate(roomTemplateId);
  const requiredOutfitTags = parseAttributeTags(room?.outfit_attribute_tags);
  const eligible = listMastersForWorld(worldId).filter(
    (m) => !m.is_not_for_sale && (requiredOutfitTags.length === 0 || tagsOverlap(parseAttributeTags(m.attribute_tags), requiredOutfitTags)),
  );
  return resolveLineup(playthroughId, worldId, roomTemplateId, 'outfit', eligible, room);
}
