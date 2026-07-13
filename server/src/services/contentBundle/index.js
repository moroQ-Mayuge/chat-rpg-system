import { buildZip, readZip } from './zip.js';
import { createImageCollector } from './diskImages.js';
import { collectCharacterEntry, importCharacterEntries } from './characterBundle.js';
import { collectWorldEntry, listRoomTemplateIdsForWorld, collectCharacterIdsForRoomTemplates, importWorldEntries } from './worldBundle.js';
import { collectRoomTemplateEntry, collectCharacterIdsForRoomTemplateIds, importRoomTemplateEntries, resolveRoomTemplateAssociations } from './roomTemplateBundle.js';
import {
  collectCharacterStatusEntries,
  collectAxisStatusTriggerEntries,
  collectEventDefinitionEntriesForWorld,
  importCharacterStatusEntries,
  importAxisStatusTriggerEntries,
  importEventDefinitionEntries,
} from './worldSystemsBundle.js';

function emptyManifest() {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    worlds: [],
    room_templates: [],
    characters: [],
    character_statuses: [],
    axis_status_triggers: [],
    event_definitions: [],
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
    if (includeCharacters) {
      const characterIds = collectCharacterIdsForRoomTemplates(roomTemplateIds);
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

// Single shared entry point for all bundle kinds (character-only, world,
// room-template) — the importer only cares about which manifest arrays are
// populated, not which export button produced the zip. Import order matters:
// worlds -> room_templates (images/props only, associations deferred) ->
// characters -> deferred room_template_characters/room_connections, since
// those last two reference names that only exist once every entity in this
// batch has actually been created.
export async function importBundle(zipBuffer, options = {}) {
  const { manifest, readImage } = readZip(zipBuffer);
  const warnings = [];

  const { created: worlds } = await importWorldEntries(manifest.worlds ?? [], readImage, warnings);

  let worldIdForRooms = worlds[0]?.id ?? options.targetWorldId ?? null;
  if ((manifest.room_templates ?? []).length > 0 && worldIdForRooms == null) {
    throw new Error('target_world_id_required');
  }

  const { created: roomTemplates, deferred } = await importRoomTemplateEntries(
    manifest.room_templates ?? [],
    readImage,
    worldIdForRooms,
    warnings,
  );

  const characters = await importCharacterEntries(manifest.characters ?? [], readImage, warnings);

  resolveRoomTemplateAssociations(deferred, worldIdForRooms, warnings, characters);

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

  return {
    created: { worlds, room_templates: roomTemplates, characters, character_statuses: characterStatuses, event_definitions_count: eventDefinitionsCreated },
    warnings,
  };
}
