import { db } from '../../db/connection.js';
import { getWorld, createWorld, setThumbnailImage } from '../../db/repositories/worldsRepo.js';
import { listRoomTemplatesForWorld } from '../../db/repositories/worldRoomTemplatesRepo.js';
import { listSlotsForRoom } from '../../db/repositories/roomParticipantSlotsRepo.js';
import { listAssignmentsForWorldRoom, setAssignment } from '../../db/repositories/worldRoomSlotAssignmentsRepo.js';
import { listPropsForWorldRoom, listFreePropsForWorldRoom, replacePropsForWorldRoom } from '../../db/repositories/worldRoomPropsRepo.js';
import { listConnectionsFrom, createConnection } from '../../db/repositories/roomConnectionsRepo.js';
import { saveWorldImage } from '../../storage/imageStorage.js';
import { extensionOf } from './diskImages.js';

const WORLD_FIELDS = [
  'name',
  'worldview',
  'time_slot_labels',
  'weather_options',
  'season_labels',
  'days_per_season',
  'image_tags',
  'protagonist_name',
  'protagonist_nickname',
  'protagonist_occupation',
  'protagonist_appearance',
  'protagonist_gender',
  'protagonist_notes',
  'protagonist_mode',
  'attribute_tags',
  'movement_points_per_time_slot',
  'max_response_tokens',
  'notify_relationship_changes',
  'status_display_settings',
];

export function collectWorldEntry(worldId, imageCollector) {
  const world = getWorld(worldId);
  const fields = Object.fromEntries(WORLD_FIELDS.map((f) => [f, world[f]]));
  const preset = world.image_style_preset_id
    ? db.prepare('SELECT name FROM image_style_presets WHERE id = ?').get(world.image_style_preset_id)
    : null;
  return {
    ...fields,
    image_style_preset_name: preset?.name ?? null,
    thumbnail_image: imageCollector.add(world.thumbnail_image_path, 'world-thumbnail'),
  };
}

// Characters actually assigned (in worldId's own slot assignments) to any of
// these room templates, so a World export with includeCharacters pulls in
// exactly the characters this World uses in its rooms — avoids bundling
// every character in the install when only a subset are relevant.
export function collectCharacterIdsForRoomTemplates(roomTemplateIds, worldId) {
  if (roomTemplateIds.length === 0) return [];
  const placeholders = roomTemplateIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT DISTINCT wrsa.character_id FROM world_room_slot_assignments wrsa
       JOIN room_template_participant_slots s ON s.id = wrsa.slot_id
       WHERE wrsa.world_id = ? AND s.room_template_id IN (${placeholders})`,
    )
    .all(worldId, ...roomTemplateIds);
  return rows.map((r) => r.character_id);
}

// World-specific concretization of each of this World's rooms: which
// character fills each slot (by slot array position, not DB id — stable
// across installs since createRoomTemplate recreates slots in array order),
// which specific props/free-props are placed, and the outgoing connection
// graph. Exported alongside the room masters themselves (roomTemplateBundle.js)
// but scoped per-World since none of this is meaningful for a room in the
// abstract (see 0030_room_world_decoupling.sql).
export function collectWorldRoomConfigEntries(worldId) {
  const rooms = listRoomTemplatesForWorld(worldId);
  return rooms.map((room) => {
    const slots = listSlotsForRoom(room.id);
    const assignments = listAssignmentsForWorldRoom(worldId, room.id);
    const assignmentByslotId = new Map(assignments.map((a) => [a.slot_id, a.character_id]));
    const slotAssignments = slots.map((slot, index) => {
      const characterId = assignmentByslotId.get(slot.id);
      const character = characterId ? db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId) : null;
      return { slot_index: index, character_name: character?.name ?? null };
    });
    return {
      room_template_name: room.name,
      slot_assignments: slotAssignments,
      prop_names: listPropsForWorldRoom(worldId, room.id).map((p) => p.name),
      free_props: listFreePropsForWorldRoom(worldId, room.id).map((p) => p.description),
      connections: listConnectionsFrom(room.id, worldId).map((c) => ({
        to_room_template_name: c.to_room_name,
        label: c.label,
        movement_cost: c.movement_cost,
      })),
    };
  });
}

// preferredRoomTemplates/preferredCharacters: this import batch's own
// rooms/characters, preferred before a whole-install name search — same
// rationale as eventPortability.js's preferredRoomTemplates/preferredCharacters
// (a name collision with a pre-existing entity elsewhere in the install would
// otherwise silently resolve to the wrong one).
export function importWorldRoomConfigEntries(entries, worldId, preferredRoomTemplates, preferredCharacters, warnings) {
  const roomByName = new Map(preferredRoomTemplates.map((r) => [r.name, r.id]));
  const characterByName = new Map(preferredCharacters.map((c) => [c.name, c.id]));

  for (const entry of entries) {
    const roomId = roomByName.get(entry.room_template_name) ?? listRoomTemplatesForWorld(worldId).find((r) => r.name === entry.room_template_name)?.id;
    if (roomId == null) {
      warnings.push(`部屋「${entry.room_template_name}」のWorld別設定の割り当て先が見つからず、スキップしました`);
      continue;
    }

    const slots = listSlotsForRoom(roomId);
    for (const assignment of entry.slot_assignments ?? []) {
      const slot = slots[assignment.slot_index];
      if (!slot || !assignment.character_name) continue;
      const characterId = characterByName.get(assignment.character_name) ?? db.prepare('SELECT id FROM characters WHERE name = ?').get(assignment.character_name)?.id;
      if (characterId == null) {
        warnings.push(`部屋「${entry.room_template_name}」の参加キャラ「${assignment.character_name}」が見つからず、割り当てをスキップしました`);
        continue;
      }
      setAssignment(worldId, slot.id, characterId);
    }

    const propIds = (entry.prop_names ?? [])
      .map((name) => db.prepare('SELECT id FROM props WHERE name = ?').get(name)?.id)
      .filter((id) => id != null);
    replacePropsForWorldRoom(worldId, roomId, { propIds, freeProps: entry.free_props ?? [] });

    for (const conn of entry.connections ?? []) {
      const toRoomId = roomByName.get(conn.to_room_template_name) ?? listRoomTemplatesForWorld(worldId).find((r) => r.name === conn.to_room_template_name)?.id;
      if (toRoomId == null) {
        warnings.push(`部屋「${entry.room_template_name}」の接続先「${conn.to_room_template_name}」が見つからず、接続をスキップしました`);
        continue;
      }
      createConnection({ world_id: worldId, from_room_template_id: roomId, to_room_template_id: toRoomId, label: conn.label, movement_cost: conn.movement_cost });
    }
  }
}

export function listRoomTemplateIdsForWorld(worldId) {
  return listRoomTemplatesForWorld(worldId).map((rt) => rt.id);
}

function resolveImageStylePresetId(name, warnings) {
  if (!name) return null;
  const preset = db.prepare('SELECT id FROM image_style_presets WHERE name = ?').get(name);
  if (!preset) {
    warnings.push(`画像スタイルプリセット「${name}」が見つからず、既定のプリセットを使用します`);
    return null;
  }
  return preset.id;
}

// Returns { created: [...], nameToId: Map } — the id map lets room_templates
// resolve world_name references purely within this same import batch (a
// combined World+Rooms bundle is self-contained; a standalone room bundle
// falls back to options.targetWorldId instead — see contentBundle/index.js).
export async function importWorldEntries(entries, readImage, warnings) {
  const created = [];
  const nameToId = new Map();
  for (const entry of entries) {
    const imageStylePresetId = resolveImageStylePresetId(entry.image_style_preset_name, warnings);
    const world = createWorld({ ...entry, image_style_preset_id: imageStylePresetId });
    if (entry.thumbnail_image) {
      const imgBuffer = readImage(entry.thumbnail_image);
      if (imgBuffer) {
        const savedPath = await saveWorldImage(world.id, imgBuffer, extensionOf(entry.thumbnail_image));
        setThumbnailImage(world.id, savedPath);
      }
    }
    created.push(getWorld(world.id));
    nameToId.set(entry.name, world.id);
  }
  return { created, nameToId };
}
