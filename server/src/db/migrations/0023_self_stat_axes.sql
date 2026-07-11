-- Self-stats (体力/気力 etc.) reuse relationship_axes/relationship_states
-- rather than a new table — see ROADMAP.md's "自己ステータス／キャラ状態
-- システム" entry for the full design rationale. `scope` distinguishes the
-- existing relationship-to-protagonist axes from these new self-stats;
-- `regen_per_time_slot` (nullable) lets an axis passively drift every time
-- slot (advanceTime), independent of any event-authored change.
ALTER TABLE relationship_axes ADD COLUMN scope TEXT NOT NULL DEFAULT 'relationship' CHECK (scope IN ('relationship', 'self_stat'));
ALTER TABLE relationship_axes ADD COLUMN regen_per_time_slot INTEGER;

-- Seed preset self-stats (curated 2026-07-11 from an external reference set,
-- with sexual/identifying/appearance/clothing/self-harm content excluded —
-- see ROADMAP.md). Ranges follow the source prompts' described thresholds;
-- these are starting points, freely editable afterward via RelationshipAxesPage.
INSERT INTO relationship_axes (name, min_value, max_value, default_value, scope, regen_per_time_slot) VALUES
  ('体力', -100, 250, 100, 'self_stat', 5),
  ('気力', -100, 250, 100, 'self_stat', NULL),
  ('満腹', 0, 100, 100, 'self_stat', -10),
  ('水分', 0, 100, 100, 'self_stat', -10),
  ('テンション', -100, 100, 0, 'self_stat', NULL),
  ('精神', -300, 100, 100, 'self_stat', NULL),
  ('道徳', -300, 300, 0, 'self_stat', NULL),
  ('善悪', -100, 100, 0, 'self_stat', NULL),
  ('従順', -200, 200, 0, 'self_stat', NULL),
  ('魅力', 0, 200, 0, 'self_stat', NULL),
  ('酔い', 0, 300, 0, 'self_stat', -15);
