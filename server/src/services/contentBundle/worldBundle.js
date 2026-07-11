import { db } from '../../db/connection.js';
import { getWorld, createWorld, setThumbnailImage } from '../../db/repositories/worldsRepo.js';
import { listRoomTemplatesForWorld } from '../../db/repositories/roomTemplatesRepo.js';
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

// Room templates referenced by a room-template bundle's own room list, so a
// World export with includeCharacters can pull in exactly the characters
// those room templates actually use — avoids bundling every character in
// the install when only a subset are relevant to this World.
export function collectCharacterIdsForRoomTemplates(roomTemplateIds) {
  if (roomTemplateIds.length === 0) return [];
  const placeholders = roomTemplateIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT DISTINCT character_id FROM room_template_characters WHERE room_template_id IN (${placeholders})`)
    .all(...roomTemplateIds);
  return rows.map((r) => r.character_id);
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
