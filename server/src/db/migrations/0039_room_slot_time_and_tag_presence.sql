-- Lets a room-master slot hold multiple candidate character assignments per
-- World, each restricted to a subset of the World's time_slot_labels
-- (empty = always present) -- see [[bugreports_2026-07-16]] item 8 (students
-- lingering at school at night). The old composite PK (world_id, slot_id)
-- only allowed one character per slot, so this is a full table rebuild.
CREATE TABLE world_room_slot_assignments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL REFERENCES room_template_participant_slots(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  time_slot_indices TEXT NOT NULL DEFAULT '[]'
);

INSERT INTO world_room_slot_assignments_new (world_id, slot_id, character_id, time_slot_indices)
  SELECT world_id, slot_id, character_id, '[]' FROM world_room_slot_assignments;

DROP TABLE world_room_slot_assignments;
ALTER TABLE world_room_slot_assignments_new RENAME TO world_room_slot_assignments;
