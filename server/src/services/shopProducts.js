import { listCandidateCategoriesForRoom } from '../db/repositories/roomItemCategoriesRepo.js';
import { listItemsForWorld } from '../db/repositories/itemsRepo.js';
import { listMastersForWorld } from '../db/repositories/outfitMastersRepo.js';
import { getRoomTemplate } from '../db/repositories/roomTemplatesRepo.js';
import { parseAttributeTags, tagsOverlap } from './attributeTagMatching.js';

// LLM向けの買い物モードプロンプト(promptBuilder.js)とUI(ShopPanel)の両方から
// 同じ商品リストを引くための共通ロジック。片方だけ更新すると「UIでは買えるのに
// 会話では売っていないと言われる」ような食い違いが起きるため、必ずここを経由する。
//
// アイテム: そのWorldの、room_template_item_categoriesで絞った候補カテゴリに
// 属し、buy_priceが設定されているもの(既存ロジックをそのまま移設)。
// 衣装: そのWorldで使える衣装マスタのうち、buy_priceが設定されていて
// is_not_for_saleでなく、部屋のoutfit_attribute_tagsと一致するもの。
// outfit_attribute_tagsが空なら絞り込み無し(全て対象)。
export function listShopProducts(worldId, roomTemplateId) {
  const room = getRoomTemplate(roomTemplateId);
  const roomCandidateItemCategories = listCandidateCategoriesForRoom(roomTemplateId);

  const items = listItemsForWorld(worldId).filter(
    (i) =>
      i.buy_price != null &&
      (roomCandidateItemCategories.length === 0 || roomCandidateItemCategories.some((c) => c.id === i.category_id)),
  );

  const requiredOutfitTags = parseAttributeTags(room?.outfit_attribute_tags);
  const outfits = listMastersForWorld(worldId).filter(
    (m) =>
      m.buy_price != null &&
      !m.is_not_for_sale &&
      (requiredOutfitTags.length === 0 || tagsOverlap(parseAttributeTags(m.attribute_tags), requiredOutfitTags)),
  );

  return { items, outfits };
}

// 'pickup'部屋(衣裳部屋など)向け: 価格は問わず、is_not_for_saleと属性キーだけで
// 絞る。買い物のような対価が無いため、buy_priceの有無はここでは無関係
// (10000/500の一括補完でほぼ全衣装にbuy_priceが付いているが、pickupの可否とは
// 別の話——非売品フラグだけが両経路に共通の除外条件)。
export function listPickupableOutfits(worldId, roomTemplateId) {
  const room = getRoomTemplate(roomTemplateId);
  const requiredOutfitTags = parseAttributeTags(room?.outfit_attribute_tags);
  return listMastersForWorld(worldId).filter(
    (m) => !m.is_not_for_sale && (requiredOutfitTags.length === 0 || tagsOverlap(parseAttributeTags(m.attribute_tags), requiredOutfitTags)),
  );
}
