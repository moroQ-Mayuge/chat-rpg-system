-- Lets event_fire_history queries be scoped to the current room stay
-- (room_session_id) instead of always accumulating over the whole route
-- (playthrough_id) -- see [[bugreports_2026-07-16]] item 6.
--
-- Two independent reset_scope switches on event_definitions, since an
-- event's own cooldown/max_fires behavior and how OTHER events treat it as
-- a chain prerequisite are separate concerns (e.g. a staged non-persistent
-- chain like "イチャイチャする" -> "キスする" that should reset when leaving
-- the room, decided by the requiring event's own setting -- not by however
-- the prerequisite event happens to be configured):
--   reset_scope             -- this event's own cooldown_turns/max_fires_per_session
--   prerequisite_reset_scope -- how THIS event's prerequisite_event_definition_id
--                               check (hasFiredWithOutcome) is scoped
ALTER TABLE event_fire_history ADD COLUMN room_session_id INTEGER REFERENCES room_sessions(id) ON DELETE CASCADE;
ALTER TABLE event_definitions ADD COLUMN reset_scope TEXT NOT NULL DEFAULT 'playthrough' CHECK (reset_scope IN ('playthrough', 'session'));
ALTER TABLE event_definitions ADD COLUMN prerequisite_reset_scope TEXT NOT NULL DEFAULT 'playthrough' CHECK (prerequisite_reset_scope IN ('playthrough', 'session'));
