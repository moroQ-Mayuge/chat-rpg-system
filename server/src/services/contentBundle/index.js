import { buildZip, readZip } from './zip.js';
import { createImageCollector } from './diskImages.js';
import { collectCharacterEntry, importCharacterEntries } from './characterBundle.js';
import {
  collectWorldEntry,
  listRoomTemplateIdsForWorld,
  collectCharacterIdsForRoomTemplates,
  collectWorldRoomConfigEntries,
  importWorldEntries,
  importWorldRoomConfigEntries,
} from './worldBundle.js';
import { collectRoomTemplateEntry, collectCharacterIdsForRoomTemplateIds, importRoomTemplateEntries } from './roomTemplateBundle.js';
import {
  collectCharacterStatusEntries,
  collectAxisStatusTriggerEntries,
  collectEventDefinitionEntriesForWorld,
  importCharacterStatusEntries,
  importAxisStatusTriggerEntries,
  importEventDefinitionEntries,
} from './worldSystemsBundle.js';
import { exportEventDefinitionJson } from '../eventPortability.js';
import { collectPlaythroughEntry, importPlaythroughEntry } from './playthroughBundle.js';

function emptyManifest() {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    worlds: [],
    room_templates: [],
    world_room_configs: [],
    characters: [],
    character_statuses: [],
    axis_status_triggers: [],
    event_definitions: [],
    playthroughs: [],
  };
}

export async function exportCharacterBundle(characterId) {
  const imageCollector = createImageCollector();
  const manifest = emptyManifest();
  manifest.characters.push(collectCharacterEntry(characterId, imageCollector));
  return buildZip(manifest, imageCollector.entries);
}

export async function exportWorldBundle(
  worldId,
  { includeRoomTemplates = false, includeCharacters = false, includeStatusesAndEvents = false } = {},
) {
  const imageCollector = createImageCollector();
  const manifest = emptyManifest();
  manifest.worlds.push(collectWorldEntry(worldId, imageCollector));

  if (includeRoomTemplates) {
    const roomTemplateIds = listRoomTemplateIdsForWorld(worldId);
    manifest.room_templates = roomTemplateIds.map((id) => collectRoomTemplateEntry(id, imageCollector));
    // World-specific concretization (slot assignments/props/connections) —
    // rooms are shared master data now, so this is exported separately from
    // the room masters themselves (see worldBundle.js's collectWorldRoomConfigEntries).
    manifest.world_room_configs = collectWorldRoomConfigEntries(worldId);
    if (includeCharacters) {
      const characterIds = collectCharacterIdsForRoomTemplates(roomTemplateIds, worldId);
      manifest.characters = characterIds.map((id) => collectCharacterEntry(id, imageCollector));
    }
  }
  // Statuses/triggers/events aren't meaningful without the World's own rooms
  // and characters already selected above — character_statuses references
  // World IDs, and events reference characters by name for later resolution.
  if (includeStatusesAndEvents) {
    manifest.character_statuses = collectCharacterStatusEntries(worldId);
    manifest.axis_status_triggers = collectAxisStatusTriggerEntries(worldId);
    manifest.event_definitions = collectEventDefinitionEntriesForWorld(worldId);
  }
  return buildZip(manifest, imageCollector.entries);
}

export async function exportRoomTemplateBundle(roomTemplateId, { includeCharacters = false } = {}) {
  const imageCollector = createImageCollector();
  const manifest = emptyManifest();
  manifest.room_templates.push(collectRoomTemplateEntry(roomTemplateId, imageCollector));
  if (includeCharacters) {
    const characterIds = collectCharacterIdsForRoomTemplateIds([roomTemplateId]);
    manifest.characters = characterIds.map((id) => collectCharacterEntry(id, imageCollector));
  }
  return buildZip(manifest, imageCollector.entries);
}

// ルート単体のエクスポート。世界観・キャラ・部屋・イベントは同梱しない
// (別途エクスポート済みであることが前提 — playthroughBundle.js 冒頭のコメント参照)。
export async function exportPlaythroughBundle(playthroughId, { includeMessages = false } = {}) {
  const imageCollector = createImageCollector();
  const manifest = emptyManifest();
  manifest.playthroughs.push(collectPlaythroughEntry(playthroughId, imageCollector, { includeMessages }));
  return buildZip(manifest, imageCollector.entries);
}

// User-picked (checkbox-selected) events, as opposed to
// collectEventDefinitionEntriesForWorld's "everything a World owns" --
// no ownership inference needed since the ids are already explicit.
export async function exportEventDefinitionsBundle(eventIds) {
  const manifest = emptyManifest();
  manifest.event_definitions = eventIds.map((id) => exportEventDefinitionJson(id));
  return buildZip(manifest, []);
}

// Single shared entry point for all bundle kinds (character-only, world,
// room-template) — the importer only cares about which manifest arrays are
// populated, not which export button produced the zip. Import order matters:
// worlds -> room_templates (master data, attached to worldIdForRooms) ->
// characters -> world_room_configs (slot assignments/props/connections),
// since that last step references names that only exist once every entity
// in this batch has actually been created.
export async function importBundle(zipBuffer, options = {}) {
  const { manifest, readImage } = readZip(zipBuffer);
  const warnings = [];

  const { created: worlds } = await importWorldEntries(manifest.worlds ?? [], readImage, warnings);

  let worldIdForRooms = worlds[0]?.id ?? options.targetWorldId ?? null;
  if ((manifest.room_templates ?? []).length > 0 && worldIdForRooms == null) {
    throw new Error('target_world_id_required');
  }

  const { created: roomTemplates } = await importRoomTemplateEntries(
    manifest.room_templates ?? [],
    readImage,
    worldIdForRooms,
    warnings,
  );

  const characters = await importCharacterEntries(manifest.characters ?? [], readImage, warnings);

  if ((manifest.world_room_configs ?? []).length > 0 && worldIdForRooms != null) {
    importWorldRoomConfigEntries(manifest.world_room_configs, worldIdForRooms, roomTemplates, characters, warnings);
  }

  // character_statuses are World-scoped by id, so importing them needs an
  // actual target World to attach to (falls back to options.targetWorldId
  // the same way room templates do, for a standalone/no-world bundle).
  let characterStatuses = [];
  if ((manifest.character_statuses ?? []).length > 0 && worldIdForRooms != null) {
    const { created: statuses, nameToId } = importCharacterStatusEntries(manifest.character_statuses, worldIdForRooms);
    characterStatuses = statuses;
    importAxisStatusTriggerEntries(manifest.axis_status_triggers ?? [], nameToId, warnings);
  }

  // Event definitions reference characters/statuses/room templates purely by
  // name (see eventPortability.js), so they can only be imported after every
  // character/status/room template above has actually been created.
  let eventDefinitionsCreated = 0;
  if ((manifest.event_definitions ?? []).length > 0) {
    eventDefinitionsCreated = importEventDefinitionEntries(manifest.event_definitions, warnings, roomTemplates, characters, characterStatuses);
  }

  // ルートは最後 — room_template_id/character_id/status_id/item_id/
  // event_definition_id を、ここまでで実際にこの環境に存在するものの名前から
  // 引き直すので、それらが揃っている必要がある(このバンドル自体が世界観を
  // 持ち歩かないので、target_world_id は上の worldIdForRooms を流用する)。
  const playthroughs = [];
  if ((manifest.playthroughs ?? []).length > 0) {
    if (worldIdForRooms == null) throw new Error('target_world_id_required');
    for (const entry of manifest.playthroughs) {
      const result = await importPlaythroughEntry(entry, readImage, worldIdForRooms, warnings);
      playthroughs.push(result.playthrough);
    }
  }

  return {
    created: {
      worlds,
      room_templates: roomTemplates,
      characters,
      character_statuses: characterStatuses,
      event_definitions_count: eventDefinitionsCreated,
      playthroughs,
    },
    warnings,
  };
}
