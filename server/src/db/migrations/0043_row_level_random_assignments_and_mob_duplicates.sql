-- Rebuilds room_session_characters with a surrogate id PK (was a composite
-- PK on (room_session_id, character_id)) so a mob character (characters.is_mob)
-- can appear as two or more independent participant rows in the same
-- room_session -- needed for the new per-row random attribute-tag-match
-- assignment mode below, which now allows the same mob to be picked by more
-- than one random row. No uniqueness constraint is re-added: preventing
-- duplicates for non-mob characters is enforced in application code
-- (worldRoomSlotAssignmentsRepo.js), not the schema.
CREATE TABLE room_session_characters_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_session_id INTEGER NOT NULL REFERENCES room_sessions(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  left_at TEXT,
  current_outfit_id INTEGER REFERENCES outfits(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  is_accompanying INTEGER NOT NULL DEFAULT 0
);
INSERT INTO room_session_characters_new (room_session_id, character_id, joined_at, left_at, current_outfit_id, is_active, is_accompanying)
  SELECT room_session_id, character_id, joined_at, left_at, current_outfit_id, is_active, is_accompanying FROM room_session_characters;
DROP TABLE room_session_characters;
ALTER TABLE room_session_characters_new RENAME TO room_session_characters;
CREATE INDEX idx_room_session_characters_session ON room_session_characters(room_session_id);

-- world_room_slot_assignments: character_id becomes nullable -- a NULL row
-- represents a "random" row (replaces the per-slot world_room_slot_random_tag_match
-- toggle from migration 0042 with a per-row mechanism instead), plus
-- random_fill_mode/random_probability configure how that row resolves at
-- room-session-creation time.
CREATE TABLE world_room_slot_assignments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL REFERENCES room_template_participant_slots(id) ON DELETE CASCADE,
  character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
  time_slot_indices TEXT NOT NULL DEFAULT '[]',
  random_fill_mode TEXT NOT NULL DEFAULT 'always' CHECK (random_fill_mode IN ('always', 'probability')),
  random_probability REAL NOT NULL DEFAULT 1.0
);
INSERT INTO world_room_slot_assignments_new (id, world_id, slot_id, character_id, time_slot_indices)
  SELECT id, world_id, slot_id, character_id, time_slot_indices FROM world_room_slot_assignments;
DROP TABLE world_room_slot_assignments;
ALTER TABLE world_room_slot_assignments_new RENAME TO world_room_slot_assignments;

-- Superseded by the per-row character_id IS NULL mechanism above.
DROP TABLE world_room_slot_random_tag_match;
