import { db } from '../connection.js';
import { parseAttributeTags, tagsOverlap } from '../../services/attributeTagMatching.js';

// World level: which concrete character(s) fill a given room-master slot,
// for this World's instance of that room. A slot with no rows here is
// simply unfilled -- not an error state (mirrors the existing tag_match "no
// eligible candidates -> skip" precedent in characterJoin.js). A slot can
// now hold multiple assignments, each restricted to a subset of the World's
// time_slot_labels via time_slot_indices (empty = always present) -- see
// 0039_room_slot_time_and_tag_presence.sql.
export function listAssignmentsForWorldRoom(worldId, roomTemplateId) {
  const rows = db
    .prepare(
      `SELECT s.id AS slot_id, s.attribute_tags, s.note, s.sort_order,
              wrsa.id AS assignment_id, wrsa.character_id, wrsa.time_slot_indices
       FROM room_template_participant_slots s
       LEFT JOIN world_room_slot_assignments wrsa ON wrsa.slot_id = s.id AND wrsa.world_id = ?
       WHERE s.room_template_id = ?
       ORDER BY s.sort_order ASC, s.id ASC, wrsa.id ASC`,
    )
    .all(worldId, roomTemplateId);

  const slots = new Map();
  for (const row of rows) {
    if (!slots.has(row.slot_id)) {
      slots.set(row.slot_id, {
        slot_id: row.slot_id,
        attribute_tags: row.attribute_tags,
        note: row.note,
        sort_order: row.sort_order,
        assignments: [],
      });
    }
    if (row.assignment_id != null) {
      slots.get(row.slot_id).assignments.push({
        id: row.assignment_id,
        character_id: row.character_id,
        time_slot_indices: JSON.parse(row.time_slot_indices),
      });
    }
  }
  return [...slots.values()];
}

// Replaces every assignment for one (world, slot) with the given list --
// same "swap the whole array" pattern as replaceSlotsForRoom etc.
// assignments: [{ character_id, time_slot_indices: number[] }]
export function replaceAssignmentsForSlot(worldId, slotId, assignments) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM world_room_slot_assignments WHERE world_id = ? AND slot_id = ?').run(worldId, slotId);
    const insert = db.prepare(
      'INSERT INTO world_room_slot_assignments (world_id, slot_id, character_id, time_slot_indices) VALUES (?, ?, ?, ?)',
    );
    for (const a of assignments) {
      insert.run(worldId, slotId, a.character_id, JSON.stringify(a.time_slot_indices ?? []));
    }
  });
  tx();
  return { replaced: true };
}

// Which World(s) a character is currently placed into, derived from its
// slot assignments (world_id lives directly on this table, no join needed).
// Best-effort/display-only: a character with zero assignments simply has no
// World here, and one placed in several Worlds' rooms shows up in all of
// them -- there's no standalone "this character belongs to World X" concept
// yet (see character_world_membership_and_list_ui_backlog item 1), this is
// purely for CharactersPage's "所属World" grouping.
export function listWorldIdsForCharacter(characterId) {
  return db
    .prepare('SELECT DISTINCT world_id FROM world_room_slot_assignments WHERE character_id = ?')
    .all(characterId)
    .map((r) => r.world_id);
}

// The context tags eligible in this room: the room master's own
// attribute_tags plus its World's -- same definition as characterJoin.js's
// getContextTags, duplicated here (rather than imported) since that module
// resolves the World from a playthrough_id and this one already has the
// worldId directly.
function getContextTags(worldId, roomTemplateId) {
  const template = db.prepare('SELECT attribute_tags FROM room_templates WHERE id = ?').get(roomTemplateId);
  if (!template) return [];
  const world = db.prepare('SELECT attribute_tags FROM worlds WHERE id = ?').get(worldId);
  return [...parseAttributeTags(template.attribute_tags), ...parseAttributeTags(world?.attribute_tags)];
}

// Characters whose own attribute_tags overlap this room+World's context tags
// (chat enhancement backlog item 23's auto-matching, extended to room-entry
// default presence per [[bugreports_2026-07-16]] item 8's follow-up
// request): everyone matching is included as a default participant,
// supplementing (not replacing) explicit slot assignments. Unlike
// characterJoin.js's tag_match (which picks ONE candidate for an event's
// "someone shows up" moment), this represents "everyone who'd naturally be
// here" and isn't time-of-day gated.
function tagMatchedCharacterIds(worldId, roomTemplateId) {
  const contextTags = getContextTags(worldId, roomTemplateId);
  if (contextTags.length === 0) return [];
  return db
    .prepare('SELECT id, attribute_tags FROM characters')
    .all()
    .filter((c) => tagsOverlap(parseAttributeTags(c.attribute_tags), contextTags))
    .map((c) => c.id);
}

// Used by roomSessionsRepo.createRoomSession at session-start time. Combines
// explicit per-slot assignments (filtered to the current time slot, empty
// time_slot_indices = always present) with attribute-tag auto-matched
// characters, deduplicated.
export function listDefaultParticipantCharacterIdsForWorldRoom(worldId, roomTemplateId, currentTimeSlotIndex) {
  const assignedRows = db
    .prepare(
      `SELECT wrsa.character_id, wrsa.time_slot_indices
       FROM room_template_participant_slots s
       JOIN world_room_slot_assignments wrsa ON wrsa.slot_id = s.id AND wrsa.world_id = ?
       WHERE s.room_template_id = ?`,
    )
    .all(worldId, roomTemplateId);

  const assignedIds = assignedRows
    .filter((r) => {
      const indices = JSON.parse(r.time_slot_indices);
      return indices.length === 0 || indices.includes(currentTimeSlotIndex);
    })
    .map((r) => r.character_id);

  const tagMatchedIds = tagMatchedCharacterIds(worldId, roomTemplateId);

  return [...new Set([...assignedIds, ...tagMatchedIds])];
}
