-- Day-of-week / holiday concept, extending the existing season/time_slot/
-- weather calendar system (see worlds.season_labels etc., 0001_init.sql)
-- with the same design: World-configurable label array + flag_state-driven
-- event visibility (no new condition_type). See [[bugreports_2026-07-16]]
-- item 7.
ALTER TABLE worlds ADD COLUMN day_of_week_labels TEXT NOT NULL DEFAULT '["月","火","水","木","金","土","日"]';
-- Indices into day_of_week_labels that count as a holiday (e.g. [5,6] for 土日).
ALTER TABLE worlds ADD COLUMN holiday_weekday_indices TEXT NOT NULL DEFAULT '[]';

-- One-off/recurring specific-day holidays (school festivals, anniversaries),
-- keyed by day_of_year (1-based, wraps every days_per_season * season_labels
-- length -- i.e. repeats every in-game "year") rather than an absolute
-- playthrough day, so the same World's holidays apply consistently across
-- every playthrough of it.
CREATE TABLE world_calendar_holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  day_of_year INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT ''
);
