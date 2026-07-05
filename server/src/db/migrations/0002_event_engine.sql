-- Adds set_at_turn to session_flags so the turn_count condition's
-- reference: "flag_set" can compute elapsed turns since a flag was set
-- (SPEC.md 3.6.3). Added as a follow-up migration rather than editing
-- 0001_init.sql, since real character/session/message data already exists.
ALTER TABLE session_flags ADD COLUMN set_at_turn INTEGER;
