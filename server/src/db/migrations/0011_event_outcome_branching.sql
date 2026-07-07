-- Success/failure outcome branching (chat enhancement backlog item 6):
-- an event can optionally check a second set of conditions AFTER it fires
-- (phase='outcome', as opposed to the existing phase='trigger' conditions
-- that gate whether it fires at all) to decide success vs failure, then run
-- only the actions tagged for that outcome. has_outcome_branch defaults to
-- false so every existing event keeps its current single-action-list
-- behavior unchanged; outcome_logic mirrors condition_logic (AND/OR) but as
-- a separate field since trigger and outcome checks are logically distinct.
--
-- Also adds 'llm_judge' as a condition_type — evaluates a short KoboldCpp
-- classification call against the just-generated response, per the user's
-- request to combine it with the existing deterministic condition types
-- (probability/relationship_threshold/etc.) rather than replacing them.
--
-- Rebuild event_conditions for the new condition_type + phase column
-- (SQLite requires a full table rebuild to change a CHECK constraint).
CREATE TABLE event_conditions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL CHECK (
    condition_type IN (
      'probability', 'turn_count', 'keyword', 'relationship_threshold', 'flag_state',
      'participant_count', 'has_item', 'llm_judge'
    )
  ),
  params TEXT NOT NULL DEFAULT '{}',
  phase TEXT NOT NULL DEFAULT 'trigger' CHECK (phase IN ('trigger', 'outcome'))
);
INSERT INTO event_conditions_new (id, event_definition_id, condition_type, params)
  SELECT id, event_definition_id, condition_type, params FROM event_conditions;
DROP TABLE event_conditions;
ALTER TABLE event_conditions_new RENAME TO event_conditions;

ALTER TABLE event_definitions ADD COLUMN has_outcome_branch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event_definitions ADD COLUMN outcome_logic TEXT NOT NULL DEFAULT 'AND';

ALTER TABLE event_actions ADD COLUMN outcome TEXT NOT NULL DEFAULT 'always' CHECK (outcome IN ('always', 'success', 'failure'));
