-- Per-(World, slot) toggle: when a row exists, that slot picks ONE random
-- character (weighted by event_participation_weight) matching the slot's
-- own attribute_tags at room-session-creation time, instead of (or in
-- addition to) explicit world_room_slot_assignments rows. Row presence =
-- enabled, mirroring the world_character_statuses junction-table convention
-- (0040) rather than a boolean column.
CREATE TABLE world_room_slot_random_tag_match (
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL REFERENCES room_template_participant_slots(id) ON DELETE CASCADE,
  PRIMARY KEY (world_id, slot_id)
);
