import { db } from '../connection.js';
import { parseAttributeTags, tagsOverlapOrWildcard } from '../../services/attributeTagMatching.js';
import { getTagMatchMaxCount } from './worldRoomTemplatesRepo.js';
import { isEligibleInRoute } from '../../services/routeScopedCharacters.js';

// World level: which concrete character(s) fill a given room-master slot,
// for this World's instance of that room. A slot with no rows here is
// simply unfilled -- not an error state (mirrors the existing tag_match "no
// eligible candidates -> skip" precedent in characterJoin.js). A slot can
// hold multiple assignment rows, each independently restricted to a subset
// of the World's time_slot_labels via time_slot_indices (empty = always
// present) -- see 0039_room_slot_time_and_tag_presence.sql. A row with
// character_id IS NULL is a "random" row (2026-07-18, 0043): at
// room-session-creation time it picks (or doesn't -- see random_fill_mode)
// ONE character matching the slot's own attribute_tags, rather than a fixed
// character_id.
export function listAssignmentsForWorldRoom(worldId, roomTemplateId) {
  const rows = db
    .prepare(
      `SELECT s.id AS slot_id, s.attribute_tags, s.note, s.sort_order,
              wrsa.id AS assignment_id, wrsa.character_id, wrsa.time_slot_indices,
              wrsa.random_fill_mode, wrsa.random_probability
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
        random_fill_mode: row.random_fill_mode,
        random_probability: row.random_probability,
      });
    }
  }
  return [...slots.values()];
}

// Replaces every assignment row for one (world, slot) with the given list --
// same "swap the whole array" pattern as replaceSlotsForRoom etc.
// assignments: [{ character_id: number|null, time_slot_indices: number[], random_fill_mode?, random_probability? }]
// character_id null = a "random" row (see module comment above).
export function replaceAssignmentsForSlot(worldId, slotId, assignments) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM world_room_slot_assignments WHERE world_id = ? AND slot_id = ?').run(worldId, slotId);
    const insert = db.prepare(
      `INSERT INTO world_room_slot_assignments (world_id, slot_id, character_id, time_slot_indices, random_fill_mode, random_probability)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const a of assignments) {
      insert.run(
        worldId,
        slotId,
        a.character_id ?? null,
        JSON.stringify(a.time_slot_indices ?? []),
        a.random_fill_mode ?? 'always',
        a.random_probability ?? 1.0,
      );
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

// Which World(s) a character could appear in purely via attribute-tag
// matching (tagMatchedCharacterIds' "everyone auto-appears" mechanism and
// row-level random slots), not just fixed assignments -- listWorldIdsForCharacter
// above can never see this, since a tag-matched character has no row in
// world_room_slot_assignments naming their character_id at all. Time-slot
// restrictions and random_probability are deliberately ignored here: this
// answers "could X ever show up in this World", not "will X show up right
// now", so any row-level random row's tags count regardless of when it fires.
//
// Computed once per World (not once per character) precisely to keep this
// cheap: for each World, build a flat set of every tag that could pull
// someone in across all its rooms (room's own tags per the same
// fallback-to-World logic as getContextTags, unioned with every row-level
// random slot's own tags), then scan the character table once per World
// against that pool -- O(worlds x rooms/slots + worlds x characters) instead
// of the O(characters x worlds x rooms) a per-character version would cost.
export function listTagDerivedWorldIdsByCharacter() {
  const worlds = db.prepare('SELECT id, attribute_tags FROM worlds').all();
  const characters = db.prepare('SELECT id, attribute_tags FROM characters').all();

  const result = new Map();

  for (const world of worlds) {
    const rooms = db
      .prepare(
        `SELECT rt.id, rt.attribute_tags FROM room_templates rt
         JOIN world_room_templates wrt ON wrt.room_template_id = rt.id
         WHERE wrt.world_id = ?`,
      )
      .all(world.id);

    const pool = new Set();
    for (const room of rooms) {
      const roomTags = parseAttributeTags(room.attribute_tags);
      const contextTags = roomTags.length > 0 ? roomTags : parseAttributeTags(world.attribute_tags);
      contextTags.forEach((t) => pool.add(t));

      const slotTagRows = db
        .prepare(
          `SELECT DISTINCT s.attribute_tags FROM room_template_participant_slots s
           JOIN world_room_slot_assignments wrsa ON wrsa.slot_id = s.id AND wrsa.world_id = ?
           WHERE s.room_template_id = ? AND wrsa.character_id IS NULL`,
        )
        .all(world.id, room.id);
      for (const row of slotTagRows) {
        parseAttributeTags(row.attribute_tags).forEach((t) => pool.add(t));
      }
    }

    if (pool.size === 0) continue;
    const poolArr = [...pool];
    for (const character of characters) {
      if (!tagsOverlapOrWildcard(parseAttributeTags(character.attribute_tags), poolArr)) continue;
      if (!result.has(character.id)) result.set(character.id, new Set());
      result.get(character.id).add(world.id);
    }
  }

  return result;
}

// The context tags eligible in this room: the room master's own
// attribute_tags if it has any, otherwise falling back to its World's --
// NOT a union (2026-07-19 change) -- a room with its own tags fully
// overrides the World's, so an author can narrow a specific room's cast
// without the World's broader tags leaking back in. Same definition as
// characterJoin.js's getContextTags, duplicated here (rather than imported)
// since that module resolves the World from a playthrough_id and this one
// already has the worldId directly.
function getContextTags(worldId, roomTemplateId) {
  const template = db.prepare('SELECT attribute_tags FROM room_templates WHERE id = ?').get(roomTemplateId);
  if (!template) return [];
  const roomTags = parseAttributeTags(template.attribute_tags);
  if (roomTags.length > 0) return roomTags;
  const world = db.prepare('SELECT attribute_tags FROM worlds WHERE id = ?').get(worldId);
  return parseAttributeTags(world?.attribute_tags);
}

// Same weighted-random pick as characterJoin.js's tag_match selection mode,
// duplicated here rather than imported -- this module resolves worldId
// directly rather than via a playthrough_id, same reasoning as
// getContextTags above.
function pickWeighted(candidateIds) {
  const weights = candidateIds.map(
    (id) => db.prepare('SELECT event_participation_weight FROM characters WHERE id = ?').get(id)?.event_participation_weight ?? 1,
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < candidateIds.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return candidateIds[i];
  }
  return candidateIds[candidateIds.length - 1];
}

// Repeatedly applies pickWeighted, removing each pick from the remaining
// pool, until `count` distinct ids are chosen (or the pool runs out). Used
// to sample down to tag_match_max_count without replacement.
function pickWeightedWithoutReplacement(candidateIds, count) {
  const remaining = [...candidateIds];
  const picked = [];
  while (picked.length < count && remaining.length > 0) {
    const chosen = pickWeighted(remaining);
    picked.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
  }
  return picked;
}

// Characters whose own attribute_tags overlap this room+World's context tags
// (chat enhancement backlog item 23's auto-matching, extended to room-entry
// default presence per [[bugreports_2026-07-16]] item 8's follow-up
// request): everyone matching is included as a default participant,
// supplementing (not replacing) explicit slot assignments. Unlike the
// per-row random assignment below (which picks at most one candidate per
// row), this represents "everyone who'd naturally be here" and isn't
// time-of-day gated. If this (World,room) pair has a
// world_room_templates.tag_match_max_count set and the matching pool
// exceeds it, a weighted-random subset (event_participation_weight, same
// weighting as the row-level random mechanism) is chosen instead of
// everyone (2026-07-20) -- below/at the cap, or with no cap set, everyone
// still matches as before.
function tagMatchedCharacterIds(worldId, roomTemplateId, playthroughId) {
  const contextTags = getContextTags(worldId, roomTemplateId);
  if (contextTags.length === 0) return [];
  const matched = db
    .prepare('SELECT id, attribute_tags, is_auto_created, origin_playthrough_id FROM characters')
    .all()
    .filter((c) => isEligibleInRoute(c, playthroughId))
    .filter((c) => tagsOverlapOrWildcard(parseAttributeTags(c.attribute_tags), contextTags))
    .map((c) => c.id);

  const maxCount = getTagMatchMaxCount(worldId, roomTemplateId);
  if (maxCount == null || matched.length <= maxCount) return matched;
  return pickWeightedWithoutReplacement(matched, maxCount);
}

// Resolves every "random" row (character_id IS NULL) eligible for the
// current time slot into 0 or 1 picked character_id each, matched against
// the OWNING SLOT's own attribute_tags (not the room/World's combined tags
// -- distinct from tagMatchedCharacterIds above). 'probability' rows roll
// first and contribute nothing on a miss; a row with no eligible candidates
// also contributes nothing (mirrors characterJoin.js's tag_match "no
// eligible candidates -> skip"). Mob characters (characters.is_mob) are
// exempt from the `taken` exclusion set -- the same mob can be picked by
// more than one random row in the same call, becoming multiple distinct
// participant instances (room_session_characters no longer enforces
// per-character uniqueness, see 0043) -- non-mob characters are added to
// `taken` once picked so they can't also be picked by a later row. Returns a
// raw array (NOT deduplicated) since mob duplicates are intentional.
function resolveRandomRows(eligibleRandomRows, taken, playthroughId) {
  if (eligibleRandomRows.length === 0) return [];
  const allCharacters = db
    .prepare('SELECT id, attribute_tags, is_mob, is_auto_created, origin_playthrough_id FROM characters')
    .all()
    .filter((c) => isEligibleInRoute(c, playthroughId));
  const picked = [];
  for (const row of eligibleRandomRows) {
    if (row.random_fill_mode === 'probability' && Math.random() > row.random_probability) continue;
    const slotTags = parseAttributeTags(row.slot_attribute_tags);
    if (slotTags.length === 0) continue;
    const pool = allCharacters
      .filter((c) => (!taken.has(c.id) || c.is_mob) && tagsOverlapOrWildcard(parseAttributeTags(c.attribute_tags), slotTags))
      .map((c) => c.id);
    if (pool.length === 0) continue;
    const chosenId = pickWeighted(pool);
    picked.push(chosenId);
    const chosen = allCharacters.find((c) => c.id === chosenId);
    if (!chosen.is_mob) taken.add(chosenId);
  }
  return picked;
}

// Used by roomSessionsRepo.createRoomSession at session-start time. Combines
// explicit fixed-character assignments (filtered to the current time slot,
// empty time_slot_indices = always present), attribute-tag auto-matched
// characters (everyone, no gating), and per-row random picks (0/1 each,
// mob duplicates allowed). The returned array is NOT globally deduplicated
// -- a mob character_id may legitimately appear more than once; the caller
// (createRoomSession) just inserts one room_session_characters row per
// element, which is safe now that character_id is no longer part of that
// table's primary key.
// playthroughId は、そのルートの子(0079)だけを候補に含めるためのもの。明示的な
// スロット割当(fixedIds)には効かせない——作者が名指しで置いたものは名指しの
// とおり出すのが筋で、絞るのは「全件から自動で拾う」経路だけでよい。
export function listDefaultParticipantCharacterIdsForWorldRoom(worldId, roomTemplateId, currentTimeSlotIndex, playthroughId) {
  const rows = db
    .prepare(
      `SELECT wrsa.character_id, wrsa.time_slot_indices, wrsa.random_fill_mode, wrsa.random_probability,
              s.attribute_tags AS slot_attribute_tags
       FROM room_template_participant_slots s
       JOIN world_room_slot_assignments wrsa ON wrsa.slot_id = s.id AND wrsa.world_id = ?
       WHERE s.room_template_id = ?`,
    )
    .all(worldId, roomTemplateId);

  const eligibleRows = rows.filter((r) => {
    const indices = JSON.parse(r.time_slot_indices);
    return indices.length === 0 || indices.includes(currentTimeSlotIndex);
  });

  const fixedIds = eligibleRows.filter((r) => r.character_id != null).map((r) => r.character_id);
  const randomRows = eligibleRows.filter((r) => r.character_id == null);

  const tagMatchedIds = tagMatchedCharacterIds(worldId, roomTemplateId, playthroughId);
  const baseIds = [...new Set([...fixedIds, ...tagMatchedIds])];

  const randomPickedIds = resolveRandomRows(randomRows, new Set(baseIds), playthroughId);

  return [...baseIds, ...randomPickedIds];
}
