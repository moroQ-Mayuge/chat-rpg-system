import { db } from '../../db/connection.js';
import { getRoomTemplate, createRoomTemplate, updateRoomTemplate } from '../../db/repositories/roomTemplatesRepo.js';
import { listSlotsForRoom } from '../../db/repositories/roomParticipantSlotsRepo.js';
import { createImportPlan, findExistingRoomTemplate, renamedForImport } from './importPlan.js';
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
//
// 同名の部屋が既にある場合は plan(importPlan.js)の判断に従う。
//  - 上書き: 既存のid・World紐付け・プロファイルは保ち、部屋本体の項目を更新する。
//    枠(slots)は並び順で、サブ部屋は名前で既存行と対応付けて「その行を更新」する
//    (作り直すと、World別の枠の割り当てや進行中セッションの位置が消えるため)。
//    ファイルに無い既存のサブ部屋・枠は残す。
//  - 別名で新規: 「名前（インポート）」で作る。
//  - スキップ: 触らない。
// 戻り値の refs は、同じバンドル内の他の取り込み(World別設定・イベント)が元の名前で
// 部屋を引き直すための {name, id}(別名で新規にした部屋も元の名前で引けるようにする)。
// skippedNames は World別設定も触らない部屋の元の名前。
export async function importRoomTemplateEntries(entries, readImage, worldId, warnings, plan = createImportPlan()) {
  const created = [];
  const refs = [];
  const skippedNames = new Set();
  for (const entry of entries) {
    const { action, existing } = plan.resolve('room_template', entry.name, findExistingRoomTemplate(entry.name, worldId));
    if (action === 'skip') {
      refs.push({ name: entry.name, id: existing.id });
      skippedNames.add(entry.name);
      continue;
    }

    const categoryIds = (entry.candidate_prop_category_names ?? [])
      .map((name) => resolvePropCategoryId(name, worldId, warnings, entry.name))
      .filter((id) => id != null);
    const existingRoom = action === 'overwrite' ? getRoomTemplate(existing.id) : null;
    const subRoomsInput = (entry.sub_rooms ?? []).map((sub) => {
      const { background_image, item_category_names, ...rest } = sub;
      return {
        ...rest,
        item_category_ids: resolveSubRoomItemCategoryIds(item_category_names, worldId, warnings, entry.name, sub.name),
      };
    });
    const slotsInput = (entry.slots ?? []).map(({ sub_room_index, ...rest }) => rest);

    let roomTemplate;
    // 上書き時に「ファイルのN番目の枠」が実際にどの既存/追加行になったか(後段でサブ部屋の配置先を設定するため)。
    const boundSlotIds = [];
    if (action === 'overwrite') {
      // サブ部屋は名前で既存行に対応付け(同名が複数あれば先頭から順に)、id付きで渡して
      // その行を更新させる。ファイルに無い既存のサブ部屋は末尾に残す。
      const unmatched = [...existingRoom.sub_rooms];
      const matchedInput = subRoomsInput.map((sub) => {
        const matchIndex = unmatched.findIndex((s) => s.name === sub.name);
        if (matchIndex < 0) return sub;
        const [match] = unmatched.splice(matchIndex, 1);
        return { ...match, ...sub, id: match.id, background_image_path: match.background_image_path };
      });
      // 並び替え(sort_order)は渡した順で決まるので、ファイル側の順の後ろに既存の残りを足す。
      const mergedSubRooms = [...matchedInput, ...unmatched];

      // 枠は並び順で既存行を更新(idを保つ)。足りない分だけ追加し、余った既存枠は残す。
      const existingSlots = listSlotsForRoom(existing.id);
      slotsInput.forEach((slot, index) => {
        const row = existingSlots[index];
        if (row) {
          db.prepare('UPDATE room_template_participant_slots SET attribute_tags = ?, note = ?, sort_order = ? WHERE id = ?').run(
            slot.attribute_tags ?? '',
            slot.note ?? '',
            slot.sort_order ?? index,
            row.id,
          );
          boundSlotIds[index] = row.id;
        } else {
          const result = db
            .prepare('INSERT INTO room_template_participant_slots (room_template_id, attribute_tags, note, sort_order) VALUES (?, ?, ?, ?)')
            .run(existing.id, slot.attribute_tags ?? '', slot.note ?? '', slot.sort_order ?? index);
          boundSlotIds[index] = Number(result.lastInsertRowid);
        }
      });

      // バンドルに含まれない項目(買い物・衣装入手・既定ポーズ等)は既存の値を土台にする。
      // slots/profiles/sub_rooms は上で個別に処理済み。ここで配列のまま渡すと全置換されてしまう。
      const { slots: _slots, profiles: _profiles, sub_rooms: _subRooms, ...baseColumns } = existingRoom;
      const { slots: _entrySlots, sub_rooms: _entrySubRooms, ...entryColumns } = entry;
      roomTemplate = updateRoomTemplate(existing.id, {
        ...baseColumns,
        ...entryColumns,
        prop_category_ids: categoryIds.length > 0 ? categoryIds : existingRoom.candidate_prop_categories.map((c) => c.id),
        item_category_ids: existingRoom.candidate_item_categories.map((c) => c.id),
        sub_rooms: mergedSubRooms,
      });
    } else {
      roomTemplate = createRoomTemplate({
        ...entry,
        name: action === 'rename' ? renamedForImport(entry.name) : entry.name,
        prop_category_ids: categoryIds,
        slots: slotsInput,
        sub_rooms: subRoomsInput,
      });
    }
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
      const slotId = boundSlotIds[index] ?? createdRoom.slots[index]?.id;
      if (slotId == null) return;
      const subRoomId = slot.sub_room_index == null ? null : (createdRoom.sub_rooms[slot.sub_room_index]?.id ?? null);
      // 新規作成の枠は元からNULLなので、上書きで配置先が外れる場合だけ意味を持つ。
      if (subRoomId != null || action === 'overwrite') {
        db.prepare('UPDATE room_template_participant_slots SET sub_room_id = ? WHERE id = ?').run(subRoomId, slotId);
      }
    });
    if (worldId != null) attachRoomToWorld(worldId, roomTemplate.id);
    const row = getRoomTemplate(roomTemplate.id);
    if (action !== 'overwrite') created.push(row);
    refs.push({ name: entry.name, id: row.id });
  }
  return { created, refs, skippedNames };
}
