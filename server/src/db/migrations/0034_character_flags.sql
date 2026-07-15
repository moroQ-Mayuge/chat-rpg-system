-- Character-scoped flags, alongside the existing route-wide global
-- session_flags (which is left entirely untouched). Mirrors
-- character_status_states' persistence_scope dual-key pattern
-- (0024_character_statuses.sql / characterStatusStatesRepo.js's
-- scopeColumns): persistence_scope picks which of playthrough_id/
-- room_session_id is the active key, the other stays NULL. No DB-level
-- uniqueness constraint, same as character_status_states -- the app layer
-- (characterFlagsRepo.js) enforces one row per (character_id, flag_key,
-- scope-key) via SELECT-then-UPDATE/INSERT, mirroring grantStatus.
--
-- Only 'playthrough' and 'session' scopes exist here (no 'accompanying') --
-- not requested, and can be added later the same way
-- carryOverAccompanyingStatuses was added for character_status_states.
CREATE TABLE character_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  flag_key TEXT NOT NULL,
  flag_value TEXT,
  persistence_scope TEXT NOT NULL CHECK (persistence_scope IN ('playthrough', 'session')),
  playthrough_id INTEGER REFERENCES playthroughs(id) ON DELETE CASCADE,
  room_session_id INTEGER REFERENCES room_sessions(id) ON DELETE CASCADE,
  set_at_turn INTEGER
);
CREATE INDEX idx_character_flags_lookup ON character_flags(character_id, flag_key);
