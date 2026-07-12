import { db } from '../../db/connection.js';
import { getRoomTemplate, createRoomTemplate } from '../../db/repositories/roomTemplatesRepo.js';
import { listConnectionsFrom, createConnection } from '../../db/repositories/roomConnectionsRepo.js';
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

// world_id is deliberately excluded — a standalone room-template bundle has
// no world of its own (see contentBundle/index.js's target_world_id flow).
// default_participant_character_names/connections reference other entities
// by name and are resolved separately, after every character/room in the
// same import batch already exists (see resolveRoomTemplateAssociations).
export function collectRoomTemplateEntry(roomTemplateId, imageCollector) {
  const rt = getRoomTemplate(roomTemplateId);
  const fields = Object.fromEntries(ROOM_TEMPLATE_FIELDS.map((f) => [f, rt[f]]));
  const propNames = rt.prop_ids.length
    ? db
        .prepare(`SELECT name FROM props WHERE id IN (${rt.prop_ids.map(() => '?').join(',')})`)
        .all(...rt.prop_ids)
        .map((r) => r.name)
    : [];
  const characterNames = rt.character_ids.length
    ? db
        .prepare(`SELECT name FROM characters WHERE id IN (${rt.character_ids.map(() => '?').join(',')})`)
        .all(...rt.character_ids)
        .map((r) => r.name)
    : [];
  const connections = listConnectionsFrom(roomTemplateId).map((c) => ({
    to_room_template_name: c.to_room_name,
    label: c.label,
    movement_cost: c.movement_cost,
  }));
  return {
    ...fields,
    background_image: imageCollector.add(rt.background_image_path, 'room-background'),
    free_props: rt.free_props.map((p) => p.description),
    prop_names: propNames,
    default_participant_character_names: characterNames,
    connections,
  };
}

export function collectCharacterIdsForRoomTemplateIds(roomTemplateIds) {
  if (roomTemplateIds.length === 0) return [];
  const placeholders = roomTemplateIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT DISTINCT character_id FROM room_template_characters WHERE room_template_id IN (${placeholders})`)
    .all(...roomTemplateIds);
  return rows.map((r) => r.character_id);
}

function resolvePropIds(names, warnings) {
  const ids = [];
  for (const name of names ?? []) {
    const prop = db.prepare('SELECT id FROM props WHERE name = ?').get(name);
    if (!prop) {
      warnings.push(`設備・機材「${name}」が見つからず、部屋テンプレートへの割り当てをスキップしました`);
      continue;
    }
    ids.push(prop.id);
  }
  return ids;
}

// Creates the room_templates rows (+ images + props/free_props, all
// self-contained) but leaves character/connection references unresolved —
// returns { created, deferred } where deferred pairs each new room's id with
// its original manifest entry, for resolveRoomTemplateAssociations to finish
// once every character/room in this import batch actually exists.
export async function importRoomTemplateEntries(entries, readImage, worldId, warnings) {
  const created = [];
  const deferred = [];
  for (const entry of entries) {
    const propIds = resolvePropIds(entry.prop_names, warnings);
    const roomTemplate = createRoomTemplate({ ...entry, world_id: worldId, prop_ids: propIds, character_ids: [] });
    if (entry.background_image) {
      const imgBuffer = readImage(entry.background_image);
      if (imgBuffer) {
        const savedPath = await saveRoomImage(roomTemplate.id, imgBuffer, extensionOf(entry.background_image));
        db.prepare('UPDATE room_templates SET background_image_path = ? WHERE id = ?').run(savedPath, roomTemplate.id);
      }
    }
    created.push(getRoomTemplate(roomTemplate.id));
    deferred.push({ roomTemplateId: roomTemplate.id, entry });
  }
  return { created, deferred };
}

// importedCharacters: the characters actually created by THIS import batch
// (from importCharacterEntries's return). Name lookups prefer this list
// first — falling back to a whole-install search only when the bundle
// references a character it didn't itself include (e.g. re-linking a room to
// an already-existing character in this install). Without this, a name that
// collides with a character that predates the import (very likely when
// re-importing a bundle exported from the very same install, or duplicating
// content that shares a cast) would silently resolve to the pre-existing
// character instead of the one this batch just created.
export function resolveRoomTemplateAssociations(deferred, worldId, warnings, importedCharacters = []) {
  const importedByName = new Map(importedCharacters.map((c) => [c.name, c.id]));
  for (const { roomTemplateId, entry } of deferred) {
    for (const name of entry.default_participant_character_names ?? []) {
      const characterId = importedByName.get(name) ?? db.prepare('SELECT id FROM characters WHERE name = ?').get(name)?.id;
      if (characterId == null) {
        warnings.push(`部屋テンプレート「${entry.name}」の登場キャラ「${name}」が見つからず、割り当てをスキップしました`);
        continue;
      }
      db.prepare(
        'INSERT INTO room_template_characters (room_template_id, character_id, is_default_participant) VALUES (?, ?, 1)',
      ).run(roomTemplateId, characterId);
    }
    for (const conn of entry.connections ?? []) {
      const toRoom = db
        .prepare('SELECT id FROM room_templates WHERE world_id = ? AND name = ?')
        .get(worldId, conn.to_room_template_name);
      if (!toRoom) {
        warnings.push(`部屋テンプレート「${entry.name}」の接続先「${conn.to_room_template_name}」が見つからず、接続をスキップしました`);
        continue;
      }
      createConnection({
        from_room_template_id: roomTemplateId,
        to_room_template_id: toRoom.id,
        label: conn.label,
        movement_cost: conn.movement_cost,
      });
    }
  }
}
