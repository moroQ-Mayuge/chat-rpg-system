-- LLM-driven dynamic status-value/relationship-value updates. See SPEC.md.
--
-- Per-axis opt-out: whether this axis (self_stat or relationship scope) is
-- eligible for the LLM to freely adjust at all, independent of the World-level
-- toggles below. Default enabled so existing axes participate once a World
-- opts in; an admin can exclude a specific axis (e.g. one meant to be changed
-- only by explicit event actions) without touching the World setting.
ALTER TABLE relationship_axes ADD COLUMN llm_auto_update_enabled INTEGER NOT NULL DEFAULT 1;

-- Status values (self-stats) update every user message via a new STAT_CHANGE
-- output tag on the main per-turn completion. New/unpredictable model
-- behavior, so opt-in per World (default off) rather than on by default.
ALTER TABLE worlds ADD COLUMN self_stat_auto_update_enabled INTEGER NOT NULL DEFAULT 0;

-- Relationship values update every N user messages (playthrough-cumulative),
-- via a separate low-temperature LLM call. NULL = disabled (default,
-- preserves existing Worlds' behavior); a positive integer sets N.
ALTER TABLE worlds ADD COLUMN relationship_update_interval_turns INTEGER;

-- Per-room-session checkpoint: countUserTurnsForPlaythrough() value at the
-- last relationship auto-update run for this session, so the periodic check
-- knows how many turns have elapsed since.
ALTER TABLE room_sessions ADD COLUMN relationship_update_last_turn INTEGER NOT NULL DEFAULT 0;
