import { db } from '../connection.js';

// World level: which concrete character fills a given room-master slot, for
// this World's instance of that room. A slot with no row here is simply
// unfilled -- not an error state (mirrors the existing tag_match "no
// eligible candidates -> skip" precedent in characterJoin.js).
export function listAssignmentsForWorldRoom(worldId, roomTemplateId) {
  return db
    .prepare(
      `SELECT s.id AS slot_id, s.attribute_tags, s.note, s.sort_order, wrsa.character_id
       FROM room_template_participant_slots s
       LEFT JOIN world_room_slot_assignments wrsa ON wrsa.slot_id = s.id AND wrsa.world_id = ?
       WHERE s.room_template_id = ?
       ORDER BY s.sort_order ASC, s.id ASC`,
    )
    .all(worldId, roomTemplateId);
}

export function setAssignment(worldId, slotId, characterId) {
  db.prepare(
    `INSERT INTO world_room_slot_assignments (world_id, slot_id, character_id) VALUES (?, ?, ?)
     ON CONFLICT (world_id, slot_id) DO UPDATE SET character_id = excluded.character_id`,
  ).run(worldId, slotId, characterId);
  return { world_id: worldId, slot_id: slotId, character_id: characterId };
}

export function clearAssignment(worldId, slotId) {
  db.prepare('DELETE FROM world_room_slot_assignments WHERE world_id = ? AND slot_id = ?').run(worldId, slotId);
  return { cleared: true };
}

// Used by roomSessionsRepo.createRoomSession at session-start time -- the
// direct replacement for the old flat room_template_characters query.
export function listDefaultParticipantCharacterIdsForWorldRoom(worldId, roomTemplateId) {
  return db
    .prepare(
      `SELECT wrsa.character_id
       FROM room_template_participant_slots s
       JOIN world_room_slot_assignments wrsa ON wrsa.slot_id = s.id AND wrsa.world_id = ?
       WHERE s.room_template_id = ?`,
    )
    .all(worldId, roomTemplateId)
    .map((r) => r.character_id);
}
