import { db } from '../../db/connection.js';
import { listAllStatuses, createStatus, attachStatusToWorld } from '../../db/repositories/characterStatusesRepo.js';
import { listRelationshipAxes } from '../../db/repositories/relationshipAxesRepo.js';
import { createTrigger } from '../../db/repositories/axisStatusTriggersRepo.js';
import { listEventDefinitions, setEventPrerequisite } from '../../db/repositories/eventDefinitionsRepo.js';
import { listRoomTemplatesForWorld, listWorldsForRoomTemplate } from '../../db/repositories/worldRoomTemplatesRepo.js';
import { exportEventDefinitionJson, importEventDefinitionJson, collectCharacterIds, collectStatusIds } from '../eventPortability.js';

export function collectCharacterStatusEntries(worldId) {
  return db
    .prepare(
      `SELECT cs.* FROM character_statuses cs
       JOIN world_character_statuses wcs ON wcs.status_id = cs.id
       WHERE wcs.world_id = ?`,
    )
    .all(worldId)
    .map((s) => ({
      name: s.name,
      persistence_scope: s.persistence_scope,
      removes_from_session: Boolean(s.removes_from_session),
      exclusive_group: s.exclusive_group,
      default_address_on_grant: s.default_address_on_grant,
    }));
}

export function collectAxisStatusTriggerEntries(worldId) {
  const statuses = db
    .prepare(
      `SELECT cs.id, cs.name FROM character_statuses cs
       JOIN world_character_statuses wcs ON wcs.status_id = cs.id
       WHERE wcs.world_id = ?`,
    )
    .all(worldId);
  if (!statuses.length) return [];
  const statusNameById = new Map(statuses.map((s) => [s.id, s.name]));
  const axisNameById = new Map(listRelationshipAxes().map((a) => [a.id, a.name]));
  const placeholders = statuses.map(() => '?').join(',');
  const triggers = db
    .prepare(`SELECT * FROM axis_status_triggers WHERE status_id IN (${placeholders})`)
    .all(...statuses.map((s) => s.id));
  return triggers
    .map((t) => ({
      axis_name: axisNameById.get(t.relationship_axis_id),
      comparison: t.comparison,
      threshold_value: t.threshold_value,
      status_name: statusNameById.get(t.status_id),
    }))
    .filter((t) => t.axis_name && t.status_name);
}

// "Belongs to this World" for export purposes. Events have no world_id
// column at all (scope='global' means "fires everywhere", not "owned by no
// one"), so ownership has to be inferred from what each event references:
//   - scope='room_template' tied to one of this World's own rooms: unambiguous
//     UNLESS the room is also attached to other Worlds (rooms are shared
//     master data, see 0030_room_world_decoupling.sql) — in that case the
//     event can't be attributed to just this World, so it's treated like the
//     zero-signal 'ambiguous' case below (deduped by name).
//   - scope='global' referencing (via character_id/status_id, including
//     inside arrays) ONLY this World's own characters/statuses: include.
//   - scope='global' referencing another World's characters/statuses (e.g.
//     World④ split into two, each with its own character copies sharing
//     names): exclude — it belongs to that other World's export instead.
//   - scope='global' referencing NO character/status at all (pure atmosphere
//     events using the "any_present"/"all_present" sentinels — season/weather
//     flavor, the 告白 events, etc.): genuinely ambiguous, since an identically
//     empty-of-references copy exists for every World that split off from a
//     shared original. Deduped by name below (lowest id wins) so a single
//     World's export never contains the same event twice — these events are,
//     by construction, content-identical across the Worlds that share them,
//     so which specific copy "wins" doesn't affect what actually plays.
export function collectEventDefinitionEntriesForWorld(worldId) {
  const roomIds = new Set(listRoomTemplatesForWorld(worldId).map((r) => r.id));
  const worldCharacterIds = new Set(
    db
      .prepare(
        `SELECT DISTINCT wrsa.character_id FROM world_room_slot_assignments wrsa
         JOIN room_template_participant_slots s ON s.id = wrsa.slot_id
         WHERE wrsa.world_id = ?`,
      )
      .all(worldId)
      .map((r) => r.character_id),
  );
  const worldStatusIds = new Set(
    db
      .prepare('SELECT status_id FROM world_character_statuses WHERE world_id = ?')
      .all(worldId)
      .map((r) => r.status_id),
  );

  function classify(def) {
    const charIds = [...collectCharacterIds(def)];
    const statusIds = [...collectStatusIds(def)];
    if (charIds.length === 0 && statusIds.length === 0) return 'ambiguous';
    const allOwnedByThisWorld = charIds.every((id) => worldCharacterIds.has(id)) && statusIds.every((id) => worldStatusIds.has(id));
    return allOwnedByThisWorld ? 'owned' : 'other_world';
  }

  function classifyRoomScoped(def) {
    if (!roomIds.has(def.room_template_id)) return 'other_world';
    return listWorldsForRoomTemplate(def.room_template_id).length > 1 ? 'ambiguous' : 'owned';
  }

  const candidates = listEventDefinitions()
    .filter((d) => d.scope === 'room_template' ? roomIds.has(d.room_template_id) : true)
    .map((d) => ({ def: d, classification: d.scope === 'room_template' ? classifyRoomScoped(d) : classify(d) }))
    .filter(({ classification }) => classification !== 'other_world');

  // dedupe ambiguous zero-signal events by name, keeping the lowest id
  const seenAmbiguousNames = new Set();
  const result = [];
  for (const { def, classification } of candidates.sort((a, b) => a.def.id - b.def.id)) {
    if (classification === 'ambiguous') {
      if (seenAmbiguousNames.has(def.name)) continue;
      seenAmbiguousNames.add(def.name);
    }
    result.push(def);
  }
  return result.map((d) => exportEventDefinitionJson(d.id));
}

export function importCharacterStatusEntries(entries, worldId) {
  const created = [];
  const nameToId = new Map();
  for (const entry of entries) {
    const status = createStatus(entry);
    attachStatusToWorld(worldId, status.id);
    created.push(status);
    nameToId.set(entry.name, status.id);
  }
  return { created, nameToId };
}

export function importAxisStatusTriggerEntries(entries, statusNameToId, warnings) {
  const axisIdByName = new Map(listRelationshipAxes().map((a) => [a.name, a.id]));
  let created = 0;
  for (const entry of entries) {
    const axisId = axisIdByName.get(entry.axis_name);
    const statusId = statusNameToId.get(entry.status_name);
    if (!axisId || !statusId) {
      warnings.push(`軸トリガー（${entry.axis_name} / ${entry.status_name}）の参照が解決できず、インポートをスキップしました`);
      continue;
    }
    createTrigger({ relationship_axis_id: axisId, comparison: entry.comparison, threshold_value: entry.threshold_value, status_id: statusId });
    created += 1;
  }
  return created;
}

// Imported in two passes. Pass 1 creates every event with its prerequisite
// left unset; pass 2 wires the prerequisites up. A single pass used to rely on
// the export order (ascending original id) happening to place a prerequisite
// before whatever references it, which isn't guaranteed at all — authors
// routinely add a prerequisite event AFTER the event that depends on it, giving
// it a higher id, and that link was then silently dropped on import. Deferring
// also lets pass 2 prefer this batch's own events over same-named events
// elsewhere in the install (event names collide freely across Worlds), the same
// rationale as the preferredRoomTemplates/preferredCharacters/preferredStatuses
// options below.
export function importEventDefinitionEntries(entries, warnings, importedRoomTemplates = [], importedCharacters = [], importedStatuses = []) {
  const imported = [];
  for (const json of entries) {
    const result = importEventDefinitionJson(json, {
      suffixName: false,
      deferPrerequisite: true,
      preferredRoomTemplates: importedRoomTemplates,
      preferredCharacters: importedCharacters,
      preferredStatuses: importedStatuses,
    });
    const label = json.data?.name ?? '(不明なイベント)';
    if (result.unresolvedCharacters.length) warnings.push(`イベント「${label}」: キャラ参照が未解決です（${result.unresolvedCharacters.join(', ')}）`);
    if (result.unresolvedStatuses.length) warnings.push(`イベント「${label}」: ステータス参照が未解決です（${result.unresolvedStatuses.join(', ')}）`);
    if (result.unresolvedOutfits.length) warnings.push(`イベント「${label}」: 衣装参照が未解決です（${result.unresolvedOutfits.join(', ')}）`);
    if (!result.roomTemplateResolved) warnings.push(`イベント「${label}」: 部屋テンプレート参照が未解決のため共通イベント化しました`);
    imported.push({ json, def: result.eventDefinition });
  }

  // First occurrence wins when the batch itself contains duplicate names —
  // arbitrary but deterministic, and matches the export side's "keep the
  // lowest id" dedupe.
  const batchIdByName = new Map();
  for (const { def } of imported) {
    if (!batchIdByName.has(def.name)) batchIdByName.set(def.name, def.id);
  }

  for (const { json, def } of imported) {
    const prereqName = json.prerequisite_event_name;
    if (!prereqName) continue;
    // Fall back to the whole install so a partial import can still attach to a
    // prerequisite the destination World already has. Never let an event become
    // its own prerequisite.
    const resolvedId =
      batchIdByName.get(prereqName) ?? listEventDefinitions().find((d) => d.name === prereqName && d.id !== def.id)?.id ?? null;
    if (resolvedId == null) {
      warnings.push(`イベント「${def.name}」: 前提イベント「${prereqName}」が見つかりませんでした`);
      continue;
    }
    setEventPrerequisite(def.id, resolvedId);
  }

  return imported.length;
}
