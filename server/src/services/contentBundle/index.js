import { buildZip, readZip } from './zip.js';
import { createImageCollector } from './diskImages.js';
import { collectCharacterEntry, importCharacterEntries } from './characterBundle.js';

export async function exportCharacterBundle(characterId) {
  const imageCollector = createImageCollector();
  const characterEntry = collectCharacterEntry(characterId, imageCollector);
  const manifest = {
    version: 1,
    exported_at: new Date().toISOString(),
    worlds: [],
    room_templates: [],
    characters: [characterEntry],
  };
  return buildZip(manifest, imageCollector.entries);
}

// Single shared entry point for all bundle kinds (character-only, world,
// room-template — see contentBundle/worldBundle.js and roomTemplateBundle.js,
// added in the next unit) — the importer only cares about which manifest
// arrays are populated, not which export button produced the zip.
export async function importBundle(zipBuffer, options = {}) {
  const { manifest, readImage } = readZip(zipBuffer);
  const warnings = [];
  const characters = await importCharacterEntries(manifest.characters ?? [], readImage, warnings);
  return { created: { worlds: [], room_templates: [], characters }, warnings };
}
