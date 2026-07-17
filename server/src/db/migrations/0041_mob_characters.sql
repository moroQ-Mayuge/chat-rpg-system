-- Adds the "mob character" concept: characters.is_mob flags characters whose
-- relationship/self-stat values and address (nickname) should never persist
-- across the whole playthrough -- only for the duration of a single room
-- session, since the same mob character_id may represent a different
-- in-fiction person in several concurrent room_sessions at once. Mirrors the
-- room_session_id-scoping pattern already used by character_status_states
-- (0024) and event_fire_history (0037).
ALTER TABLE characters ADD COLUMN is_mob INTEGER NOT NULL DEFAULT 0;

-- relationship_states previously had a composite PK (playthrough_id,
-- character_id, relationship_axis_id) with no room_session_id option --
-- rebuilt with a surrogate id PK (SQLite can't relax a PK via ALTER TABLE),
-- mirroring the world_room_slot_assignments rebuild in 0039.
CREATE TABLE relationship_states_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playthrough_id INTEGER REFERENCES playthroughs(id) ON DELETE CASCADE,
  room_session_id INTEGER REFERENCES room_sessions(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  relationship_axis_id INTEGER NOT NULL REFERENCES relationship_axes(id) ON DELETE CASCADE,
  current_value INTEGER NOT NULL DEFAULT 0
);
INSERT INTO relationship_states_new (playthrough_id, character_id, relationship_axis_id, current_value)
  SELECT playthrough_id, character_id, relationship_axis_id, current_value FROM relationship_states;
DROP TABLE relationship_states;
ALTER TABLE relationship_states_new RENAME TO relationship_states;

-- character_address_states: same rebuild, same reason.
CREATE TABLE character_address_states_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playthrough_id INTEGER REFERENCES playthroughs(id) ON DELETE CASCADE,
  room_session_id INTEGER REFERENCES room_sessions(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  current_address TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO character_address_states_new (playthrough_id, character_id, current_address, updated_at)
  SELECT playthrough_id, character_id, current_address, updated_at FROM character_address_states;
DROP TABLE character_address_states;
ALTER TABLE character_address_states_new RENAME TO character_address_states;
