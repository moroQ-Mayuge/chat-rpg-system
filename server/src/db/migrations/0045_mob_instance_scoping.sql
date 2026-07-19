-- Instance-scoping for duplicated mob characters (see
-- room_slot_row_level_random_and_mob_duplication memory's documented
-- limitation): relationship_states/character_address_states/
-- character_status_states are currently keyed by (character_id,
-- room_session_id) only, so two simultaneous instances of the same mob in
-- one room_session (room_session_characters no longer enforces uniqueness,
-- see 0043) share relationship/address/status state even though the chat
-- log shows them as distinct people ("モブ・中学生" / "モブ・中学生A").
--
-- Adds a nullable room_session_character_id alongside the existing
-- room_session_id column on all three tables. NULL preserves today's
-- behavior exactly (non-mob characters, and any call site that doesn't yet
-- know which instance it means); a non-NULL value scopes the row to one
-- specific room_session_characters row instead of the whole character.
-- All three tables already have a surrogate `id` PK from earlier migrations
-- (0041, 0024), so a plain ADD COLUMN is enough -- no table rebuild needed.
ALTER TABLE relationship_states ADD COLUMN room_session_character_id INTEGER REFERENCES room_session_characters(id) ON DELETE CASCADE;
ALTER TABLE character_address_states ADD COLUMN room_session_character_id INTEGER REFERENCES room_session_characters(id) ON DELETE CASCADE;
ALTER TABLE character_status_states ADD COLUMN room_session_character_id INTEGER REFERENCES room_session_characters(id) ON DELETE CASCADE;
