import { db } from '../../db/connection.js';
import { getRoomTemplate, createRoomTemplate } from '../../db/repositories/roomTemplatesRepo.js';
import { attachRoomToWorld } from '../../db/repositories/worldRoomTemplatesRepo.js';
import { findCategoryByName } from '../../db/repositories/itemCategoriesRepo.js';
import { saveRoomImage } from '../../storage/imageStorage.js';
import { extensionOf } from './diskImages.js';

const ROOM_TEMPLATE_FIELDS = [
  'worldview_mode',
  'name',
  'initial_situation',
  'location_text',
  'location_tags',
  'atmosphere_text',
  'atmosphere_tags',
  'worldview',
  'turns_per_time_slot',
  'attribute_tags',
  'is_place',
];

// Rooms are shared master data (0030_room_world_decoupling.sql): this
// exports only the room's own fields plus its abstract participant slots
// (attribute_tags/note, matched by array position on import — see
// importRoomTemplateEntries) and candidate prop categories (by name).
// World-specific concretization (who fills a slot, which exact props are
// placed, the connection graph) is exported separately per-World by
// worldBundle.js's collectWorldRoomConfigEntries, since a standalone
// room-template bundle has no World of its own.
// サブ部屋(0150、Stage 8): 部屋マスタ自身が持つ子なので、ここ(ルーム単体の
// バンドル)で一緒に持ち出す——ワールド別の設定(worldBundle.js)とは別。
// 枠(slots)がどのサブ部屋を指すかは、このentry内のsub_rooms配列でのインデックス
// (sub_room_index)で表す——サブ部屋はインポート時に新しいidを振られるため、
// idそのものは環境をまたげない(room_profilesのprofile_id等と同じ理由で、
// このバンドルには元々そうしたクロス参照が無かった)。
function collectSubRoomEntries(rt, imageCollector) {
  return rt.sub_rooms.map((sub) => ({
    name: sub.name,
    sort_order: sub.sort_order,
    is_default: Boolean(sub.is_default),
    location_text: sub.location_text,
    atmosphere_text: sub.atmosphere_text,
    location_tags: sub.location_tags,
    atmosphere_tags: sub.atmosphere_tags,
    enter_movement_cost: sub.enter_movement_cost,
    background_image: imageCollector.add(sub.background_image_path, 'room-sub-background'),
    is_shop: sub.is_shop,
    outfit_acquisition_mode: sub.outfit_acquisition_mode,
    outfit_attribute_tags: sub.outfit_attribute_tags,
    shop_lineup_min: sub.shop_lineup_min,
    shop_lineup_max: sub.shop_lineup_max,
    shop_lineup_refresh_unit: sub.shop_lineup_refresh_unit,
    shop_lineup_refresh_interval: sub.shop_lineup_refresh_interval,
    item_category_names: sub.item_category_ids
      .map((id) => db.prepare('SELECT name FROM item_categories WHERE id = ?').get(id)?.name)
      .filter(Boolean),
  }));
}

export function collectRoomTemplateEntry(roomTemplateId, imageCollector) {
  const rt = getRoomTemplate(roomTemplateId);
  const fields = Object.fromEntries(ROOM_TEMPLATE_FIELDS.map((f) => [f, rt[f]]));
  const subRoomIndexById = new Map(rt.sub_rooms.map((sub, index) => [sub.id, index]));
  return {
    ...fields,
    background_image: imageCollector.add(rt.background_image_path, 'room-background'),
    slots: rt.slots.map((s) => ({
      attribute_tags: s.attribute_tags,
      note: s.note,
      sort_order: s.sort_order,
      sub_room_index: s.sub_room_id != null ? (subRoomIndexById.get(s.sub_room_id) ?? null) : null,
    })),
    candidate_prop_category_names: rt.candidate_prop_categories.map((c) => c.name),
    sub_rooms: collectSubRoomEntries(rt, imageCollector),
  };
}

// Characters currently assigned to any of these rooms' slots, in ANY World
// (a standalone room-template bundle has no single World context to prefer)
// — used by exportRoomTemplateBundle's includeCharacters option so it pulls
// in a relevant character subset rather than the whole install.
export function collectCharacterIdsForRoomTemplateIds(roomTemplateIds) {
  if (roomTemplateIds.length === 0) return [];
  const placeholders = roomTemplateIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT DISTINCT wrsa.character_id FROM world_room_slot_assignments wrsa
       JOIN room_template_participant_slots s ON s.id = wrsa.slot_id
       WHERE s.room_template_id IN (${placeholders})`,
    )
    .all(...roomTemplateIds);
  return rows.map((r) => r.character_id);
}

// name -> id, preferring the common (world_id IS NULL) tier then this
// World's own tier -- matches the resolveCategoryOrFallback convention used
// for item categories, but returns null (skip, don't fall back to a default)
// since "candidate categories" is a list, not a single required field.
function resolvePropCategoryId(name, worldId, warnings, roomName) {
  const category = db
    .prepare('SELECT id FROM prop_categories WHERE (world_id IS NULL OR world_id = ?) AND name = ?')
    .get(worldId, name);
  if (!category) {
    warnings.push(`部屋テンプレート「${roomName}」の候補カテゴリ「${name}」が見つからず、割り当てをスキップしました`);
    return null;
  }
  return category.id;
}

// name -> id, per this World's item categories (common tier fallback happens
// inside findCategoryByName itself) -- mirrors resolvePropCategoryId but for
// a sub-room's commerce-override item categories (Stage 3, exported by name
// in collectSubRoomEntries since category ids aren't stable across installs).
function resolveSubRoomItemCategoryIds(names, worldId, warnings, roomName, subRoomName) {
  return (names ?? [])
    .map((name) => {
      const category = findCategoryByName(worldId, name);
      if (!category) {
        warnings.push(
          `部屋テンプレート「${roomName}」のサブ部屋「${subRoomName}」のアイテムカテゴリ「${name}」が見つからず、割り当てをスキップしました`,
        );
      }
      return category?.id ?? null;
    })
    .filter((id) => id != null);
}

// Creates the room_templates master rows (+ slots + sub_rooms + candidate
// prop categories + background images, all self-contained) and attaches
// each to worldId if given. No deferred cross-entity resolution is needed
// anymore — World-specific data (slot assignments/props/connections) is
// handled separately by importWorldRoomConfigEntries once these rooms +
// every character in the batch actually exist.
//
// サブ部屋(0150、Stage 8)は2段階で作る: createRoomTemplate内部が
// replaceSlotsForRoom→syncSubRoomsForRoomの順で子を作るため、slot側から
// サブ部屋の実idはまだ参照できない(サブ部屋がまだ存在しない)。そのため
// 作成時はslotのsub_room_index/サブ部屋のbackground_imageを一旦外して渡し、
// 作成後に実idへ解決してUPDATEする。syncSubRoomsForRoom/replaceSlotsForRoomは
// どちらも入力配列の順序どおりsort_order=indexで保存し、再読み出しは
// sort_order ASC, id ASCで並ぶため、entry.sub_rooms/entry.slotsの配列インデックス
// と作成後の配列インデックスが一致する(名前で対応付けない——同名サブ部屋を
// 許容する既存仕様のため)。
export async function importRoomTemplateEntries(entries, readImage, worldId, warnings) {
  const created = [];
  for (const entry of entries) {
    const categoryIds = (entry.candidate_prop_category_names ?? [])
      .map((name) => resolvePropCategoryId(name, worldId, warnings, entry.name))
      .filter((id) => id != null);
    const subRoomsInput = (entry.sub_rooms ?? []).map((sub) => {
      const { background_image, item_category_names, ...rest } = sub;
      return {
        ...rest,
        item_category_ids: resolveSubRoomItemCategoryIds(item_category_names, worldId, warnings, entry.name, sub.name),
      };
    });
    const slotsInput = (entry.slots ?? []).map(({ sub_room_index, ...rest }) => rest);
    const roomTemplate = createRoomTemplate({
      ...entry,
      prop_category_ids: categoryIds,
      slots: slotsInput,
      sub_rooms: subRoomsInput,
    });
    if (entry.background_image) {
      const imgBuffer = readImage(entry.background_image);
      if (imgBuffer) {
        const savedPath = await saveRoomImage(roomTemplate.id, imgBuffer, extensionOf(entry.background_image));
        db.prepare('UPDATE room_templates SET background_image_path = ? WHERE id = ?').run(savedPath, roomTemplate.id);
      }
    }
    const createdRoom = getRoomTemplate(roomTemplate.id);
    for (const [index, sub] of (entry.sub_rooms ?? []).entries()) {
      const subRoomId = createdRoom.sub_rooms[index]?.id;
      if (subRoomId == null || !sub.background_image) continue;
      const imgBuffer = readImage(sub.background_image);
      if (imgBuffer) {
        const savedPath = await saveRoomImage(subRoomId, imgBuffer, extensionOf(sub.background_image));
        db.prepare('UPDATE room_sub_rooms SET background_image_path = ? WHERE id = ?').run(savedPath, subRoomId);
      }
    }
    (entry.slots ?? []).forEach((slot, index) => {
      if (slot.sub_room_index == null) return;
      const subRoomId = createdRoom.sub_rooms[slot.sub_room_index]?.id;
      const slotId = createdRoom.slots[index]?.id;
      if (subRoomId != null && slotId != null) {
        db.prepare('UPDATE room_template_participant_slots SET sub_room_id = ? WHERE id = ?').run(subRoomId, slotId);
      }
    });
    if (worldId != null) attachRoomToWorld(worldId, roomTemplate.id);
    created.push(getRoomTemplate(roomTemplate.id));
  }
  return { created };
}
