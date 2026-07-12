import { getEventDefinition, createEventDefinition, listEventDefinitions } from '../db/repositories/eventDefinitionsRepo.js';
import { listCharacters } from '../db/repositories/charactersRepo.js';
import { listRoomTemplates } from '../db/repositories/roomTemplatesRepo.js';
import { listAllStatuses, getStatus } from '../db/repositories/characterStatusesRepo.js';
import { listOutfitsForCharacter, getOutfit } from '../db/repositories/outfitsRepo.js';

// Every (condition_type/action_type, param path) that holds a character_id
// (or an array of them). Chat enhancement backlog item 19: export/import
// portability needs to survive a character having a different id — or not
// existing at all — in the destination install, so these get resolved by
// name instead of carried over as raw ids. Kept in sync with every
// condition/action type that references a character — has_status/has_outfit
// (conditions) and change_status/set_address (actions) were added later than
// the original set and are included here too.
export function collectCharacterIds(def) {
  const ids = new Set();
  const add = (v) => {
    if (typeof v === 'number') ids.add(v);
  };
  for (const c of def.conditions) {
    if (c.condition_type === 'relationship_threshold') add(c.params.character_id);
    if (c.condition_type === 'has_status') add(c.params.character_id);
    if (c.condition_type === 'has_outfit') add(c.params.character_id);
  }
  for (const a of def.actions) {
    if (a.action_type === 'insert_dialogue') add(a.params.character_id);
    if (a.action_type === 'character_join') {
      add(a.params.character_id);
      (a.params.candidate_character_ids ?? []).forEach(add);
    }
    if (a.action_type === 'character_leave') add(a.params.character_id);
    if (a.action_type === 'generate_image') (a.params.target_character_ids ?? []).forEach(add);
    if (a.action_type === 'change_relationship') add(a.params.character_id);
    if (a.action_type === 'change_outfit') add(a.params.character_id);
    if (a.action_type === 'change_status') add(a.params.character_id);
    if (a.action_type === 'set_address') add(a.params.character_id);
  }
  return ids;
}

// status_id appears on has_status (condition) and change_status (action) —
// resolved by status name, same rationale as collectCharacterIds.
export function collectStatusIds(def) {
  const ids = new Set();
  for (const c of def.conditions) {
    if (c.condition_type === 'has_status' && typeof c.params.status_id === 'number') ids.add(c.params.status_id);
  }
  for (const a of def.actions) {
    if (a.action_type === 'change_status' && typeof a.params.status_id === 'number') ids.add(a.params.status_id);
  }
  return ids;
}

// outfit_id appears on change_outfit (action) — resolved by (character_name,
// outfit_name) pair, since outfit names are only unique per-character, not
// globally. This was previously NOT resolved at all (a latent bug: outfit_id
// carried over as a raw id, silently wrong on import into any other install).
function collectOutfitRefs(def) {
  const refs = [];
  for (const a of def.actions) {
    if (a.action_type === 'change_outfit' && typeof a.params.outfit_id === 'number' && typeof a.params.character_id === 'number') {
      refs.push({ character_id: a.params.character_id, outfit_id: a.params.outfit_id });
    }
  }
  return refs;
}

// Builds a portable JSON representation of an event definition: the same
// shape the repo already uses for conditions/actions, plus a character_names
// map (id -> name as of export time) for every character_id referenced
// inside, and the room template's name if this is a room_template-scoped
// event. Character/room-template ids themselves are NOT remapped here —
// that only happens on import, against whatever install the file lands in.
export function exportEventDefinitionJson(id) {
  const def = getEventDefinition(id);
  if (!def) throw new Error('イベント定義が見つかりません。');

  const characters = listCharacters();
  const charactersById = new Map(characters.map((c) => [c.id, c.name]));
  const characterNames = {};
  for (const charId of collectCharacterIds(def)) {
    if (charactersById.has(charId)) characterNames[charId] = charactersById.get(charId);
  }

  const statusesById = new Map(listAllStatuses().map((s) => [s.id, s.name]));
  const statusNames = {};
  for (const statusId of collectStatusIds(def)) {
    if (statusesById.has(statusId)) statusNames[statusId] = statusesById.get(statusId);
  }

  // outfit_id is only unique per-character, so each ref carries both the
  // owning character's name and the outfit's own name (not a flat id->name map).
  const outfitRefs = collectOutfitRefs(def)
    .map(({ character_id, outfit_id }) => {
      const characterName = charactersById.get(character_id);
      const outfit = getOutfit(outfit_id);
      if (!characterName || !outfit) return null;
      return { outfit_id, character_name: characterName, outfit_name: outfit.name };
    })
    .filter(Boolean);

  let roomTemplateName = null;
  if (def.scope === 'room_template' && def.room_template_id) {
    const template = listRoomTemplates().find((t) => t.id === def.room_template_id);
    roomTemplateName = template?.name ?? null;
  }

  // The prerequisite reference (chat enhancement backlog item 6, event
  // chaining) is another raw FK that would silently point at an unrelated —
  // or nonexistent — event in the destination install if carried over as-is.
  let prerequisiteEventName = null;
  if (def.prerequisite_event_definition_id) {
    const prereq = listEventDefinitions().find((d) => d.id === def.prerequisite_event_definition_id);
    prerequisiteEventName = prereq?.name ?? null;
  }

  const { id: _id, room_template_id, prerequisite_event_definition_id, ...rest } = def;

  return {
    type: 'event_definition',
    version: 1,
    exported_at: new Date().toISOString(),
    data: rest,
    room_template_name: roomTemplateName,
    prerequisite_event_name: prerequisiteEventName,
    character_names: characterNames,
    status_names: statusNames,
    outfit_refs: outfitRefs,
  };
}

function resolveCharacterRef(value, nameByOldId, idByName, unresolved) {
  if (typeof value !== 'number') return value; // null, undefined, or a sentinel string — pass through as-is
  const name = nameByOldId[value];
  const resolvedId = name ? idByName.get(name) : undefined;
  if (resolvedId == null) {
    if (name) unresolved.add(name);
    return null;
  }
  return resolvedId;
}

// Imports a previously exported event definition JSON into this install.
// Every character_id-shaped field is resolved by matching the exported name
// against this install's current characters (first match wins if duplicate
// names exist — see chat enhancement backlog item 6 for the underlying
// duplicate-name gap this inherits). Unresolvable references become null
// rather than silently keeping a raw id that would point at an unrelated
// character in this install. Returns the created definition plus a report of
// what couldn't be resolved so the caller can warn the user.
export function importEventDefinitionJson(json, options = {}) {
  if (json?.type !== 'event_definition') throw new Error('イベント定義のエクスポートファイルではありません。');

  const nameByOldId = json.character_names ?? {};
  const idByName = new Map(listCharacters().map((c) => [c.name, c.id]));
  const unresolvedCharacters = new Set();

  const statusNameByOldId = json.status_names ?? {};
  const statusIdByName = new Map(listAllStatuses().map((s) => [s.name, s.id]));
  const unresolvedStatuses = new Set();

  const outfitRefByOldId = new Map((json.outfit_refs ?? []).map((r) => [r.outfit_id, r]));
  const unresolvedOutfits = new Set();

  const data = structuredClone(json.data);

  const resolveStatusRef = (value) => {
    if (typeof value !== 'number') return value;
    const name = statusNameByOldId[value];
    const resolvedId = name ? statusIdByName.get(name) : undefined;
    if (resolvedId == null) {
      if (name) unresolvedStatuses.add(name);
      return null;
    }
    return resolvedId;
  };
  const resolveOutfitRef = (value, newCharacterId) => {
    if (typeof value !== 'number') return value;
    const ref = outfitRefByOldId.get(value);
    if (!ref || newCharacterId == null) {
      if (ref) unresolvedOutfits.add(`${ref.character_name}/${ref.outfit_name}`);
      return null;
    }
    const outfit = listOutfitsForCharacter(newCharacterId).find((o) => o.name === ref.outfit_name);
    if (!outfit) {
      unresolvedOutfits.add(`${ref.character_name}/${ref.outfit_name}`);
      return null;
    }
    return outfit.id;
  };

  for (const c of data.conditions ?? []) {
    if (c.condition_type === 'relationship_threshold') {
      c.params.character_id = resolveCharacterRef(c.params.character_id, nameByOldId, idByName, unresolvedCharacters);
    }
    if (c.condition_type === 'has_status') {
      c.params.character_id = resolveCharacterRef(c.params.character_id, nameByOldId, idByName, unresolvedCharacters);
      c.params.status_id = resolveStatusRef(c.params.status_id);
    }
    if (c.condition_type === 'has_outfit') {
      c.params.character_id = resolveCharacterRef(c.params.character_id, nameByOldId, idByName, unresolvedCharacters);
    }
  }
  for (const a of data.actions ?? []) {
    if (a.action_type === 'insert_dialogue') {
      a.params.character_id = resolveCharacterRef(a.params.character_id, nameByOldId, idByName, unresolvedCharacters);
    }
    if (a.action_type === 'character_join') {
      a.params.character_id = resolveCharacterRef(a.params.character_id, nameByOldId, idByName, unresolvedCharacters);
      a.params.candidate_character_ids = (a.params.candidate_character_ids ?? [])
        .map((cid) => resolveCharacterRef(cid, nameByOldId, idByName, unresolvedCharacters))
        .filter((cid) => cid != null);
    }
    if (a.action_type === 'character_leave') {
      a.params.character_id = resolveCharacterRef(a.params.character_id, nameByOldId, idByName, unresolvedCharacters);
    }
    if (a.action_type === 'generate_image') {
      a.params.target_character_ids = (a.params.target_character_ids ?? [])
        .map((cid) => resolveCharacterRef(cid, nameByOldId, idByName, unresolvedCharacters))
        .filter((cid) => cid != null);
    }
    if (a.action_type === 'change_relationship') {
      a.params.character_id = resolveCharacterRef(a.params.character_id, nameByOldId, idByName, unresolvedCharacters);
    }
    if (a.action_type === 'change_outfit') {
      const oldOutfitId = a.params.outfit_id;
      a.params.character_id = resolveCharacterRef(a.params.character_id, nameByOldId, idByName, unresolvedCharacters);
      a.params.outfit_id = resolveOutfitRef(oldOutfitId, a.params.character_id);
    }
    if (a.action_type === 'change_status') {
      a.params.character_id = resolveCharacterRef(a.params.character_id, nameByOldId, idByName, unresolvedCharacters);
      a.params.status_id = resolveStatusRef(a.params.status_id);
    }
    if (a.action_type === 'set_address') {
      a.params.character_id = resolveCharacterRef(a.params.character_id, nameByOldId, idByName, unresolvedCharacters);
    }
  }

  // options.preferredRoomTemplates: room templates created by THIS import
  // batch (passed by the world-bundle importer), searched before falling
  // back to a whole-install search — same rationale as importedCharacters in
  // resolveRoomTemplateAssociations (roomTemplateBundle.js): a name that
  // collides with a pre-existing room template elsewhere in the install
  // would otherwise silently resolve to the wrong one.
  let roomTemplateResolved = true;
  if (data.scope === 'room_template') {
    const preferred = (options.preferredRoomTemplates ?? []).find((t) => t.name === json.room_template_name);
    const template = preferred ?? (json.room_template_name ? listRoomTemplates().find((t) => t.name === json.room_template_name) : null);
    if (template) {
      data.room_template_id = template.id;
    } else {
      roomTemplateResolved = false;
      data.scope = 'global';
      data.room_template_id = null;
    }
  }

  let prerequisiteResolved = true;
  if (json.prerequisite_event_name) {
    const prereq = listEventDefinitions().find((d) => d.name === json.prerequisite_event_name);
    if (prereq) {
      data.prerequisite_event_definition_id = prereq.id;
    } else {
      prerequisiteResolved = false;
      data.prerequisite_event_definition_id = null;
    }
  }

  if (options.suffixName !== false) data.name = `${data.name}（インポート）`;

  const created = createEventDefinition(data);
  return {
    eventDefinition: created,
    unresolvedCharacters: [...unresolvedCharacters],
    unresolvedStatuses: [...unresolvedStatuses],
    unresolvedOutfits: [...unresolvedOutfits],
    roomTemplateResolved,
    prerequisiteResolved,
  };
}
