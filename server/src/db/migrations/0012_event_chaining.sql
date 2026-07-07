-- Event chaining (chat enhancement backlog item 6): an event can require a
-- prerequisite event to have already fired in the same playthrough, optionally
-- with a specific outcome. Requires event_fire_history to actually record the
-- outcome of each fire, which it didn't until now (outcome branching itself,
-- backlog item 5, only kept the resolved outcome in memory).

ALTER TABLE event_fire_history ADD COLUMN outcome TEXT CHECK (outcome IN ('success', 'failure'));

ALTER TABLE event_definitions ADD COLUMN prerequisite_event_definition_id INTEGER REFERENCES event_definitions(id) ON DELETE SET NULL;
ALTER TABLE event_definitions ADD COLUMN requires_prerequisite_outcome TEXT NOT NULL DEFAULT 'any' CHECK (requires_prerequisite_outcome IN ('any', 'success', 'failure'));
