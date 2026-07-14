import { db } from '../../db/connection.js';
import { getRoomTemplate, createRoomTemplate } from '../../db/repositories/roomTemplatesRepo.js';
import { attachRoomToWorld } from '../../db/repositories/worldRoomTemplatesRepo.js';
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
export function collectRoomTemplateEntry(roomTemplateId, imageCollector) {
  const rt = getRoomTemplate(roomTemplateId);
  const fields = Object.fromEntries(ROOM_TEMPLATE_FIELDS.map((f) => [f, rt[f]]));
  return {
    ...fields,
    background_image: imageCollector.add(rt.background_image_path, 'room-background'),
    slots: rt.slots.map((s) => ({ attribute_tags: s.attribute_tags, note: s.note, sort_order: s.sort_order })),
    candidate_prop_category_names: rt.candidate_prop_categories.map((c) => c.name),
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

// Creates the room_templates master rows (+ slots + candidate prop
// categories + background image, all self-contained) and attaches each to
// worldId if given. No deferred cross-entity resolution is needed anymore —
// World-specific data (slot assignments/props/connections) is handled
// separately by importWorldRoomConfigEntries once these rooms + every
// character in the batch actually exist.
export async function importRoomTemplateEntries(entries, readImage, worldId, warnings) {
  const created = [];
  for (const entry of entries) {
    const categoryIds = (entry.candidate_prop_category_names ?? [])
      .map((name) => resolvePropCategoryId(name, worldId, warnings, entry.name))
      .filter((id) => id != null);
    const roomTemplate = createRoomTemplate({ ...entry, prop_category_ids: categoryIds });
    if (entry.background_image) {
      const imgBuffer = readImage(entry.background_image);
      if (imgBuffer) {
        const savedPath = await saveRoomImage(roomTemplate.id, imgBuffer, extensionOf(entry.background_image));
        db.prepare('UPDATE room_templates SET background_image_path = ? WHERE id = ?').run(savedPath, roomTemplate.id);
      }
    }
    if (worldId != null) attachRoomToWorld(worldId, roomTemplate.id);
    created.push(getRoomTemplate(roomTemplate.id));
  }
  return { created };
}
