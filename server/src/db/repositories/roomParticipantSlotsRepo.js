import { db } from '../connection.js';

// Room-master level: abstract participant "slots" a room declares, matched
// by attribute key (see attributeTagMatching.js) rather than a fixed
// character_id -- lets the same room master be reused across Worlds with
// completely different casts. Which concrete character fills a slot is a
// per-World decision (worldRoomSlotAssignmentsRepo.js).
export function listSlotsForRoom(roomTemplateId) {
  return db
    .prepare('SELECT * FROM room_template_participant_slots WHERE room_template_id = ? ORDER BY sort_order ASC, id ASC')
    .all(roomTemplateId);
}

// Full-replace, matching this codebase's existing convention for room
// template child collections (props/free_props previously, now slots).
export function replaceSlotsForRoom(roomTemplateId, slots) {
  db.prepare('DELETE FROM room_template_participant_slots WHERE room_template_id = ?').run(roomTemplateId);
  (slots ?? []).forEach((slot, index) => {
    db.prepare(
      'INSERT INTO room_template_participant_slots (room_template_id, attribute_tags, note, sort_order) VALUES (?, ?, ?, ?)',
    ).run(roomTemplateId, slot.attribute_tags ?? '', slot.note ?? '', slot.sort_order ?? index);
  });
  return listSlotsForRoom(roomTemplateId);
}

export function deleteSlot(id) {
  db.prepare('DELETE FROM room_template_participant_slots WHERE id = ?').run(id);
  return { deleted: true };
}
