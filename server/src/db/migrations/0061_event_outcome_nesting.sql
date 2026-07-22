-- Recursive/nested success-failure branching within a single event definition:
-- lets an event's root success/failure branch (event_definitions.has_outcome_branch/
-- outcome_logic, UNCHANGED) grow its own nested success/failure decision point
-- under either resolved branch, to a hard-capped depth (MAX_OUTCOME_NODE_DEPTH
-- in eventEngine/index.js and EventsPage.jsx, currently 2). This is a small
-- binary tree hanging off the existing root branch, not a general graph.
-- Purely additive: a pre-existing event has zero rows here and behaves
-- identically to before.
--
-- parent_node_id IS NULL means this node is the (at most one per branch_key)
-- node attached directly under the ROOT's own success/failure branch --
-- distinct from an unbranched event, which simply has no rows here at all.
-- depth is denormalized (1 for a root-attached node, 2 for a node nested
-- under another node) purely so both the engine's fire-time guard and the
-- repo's save-time guard can check the depth cap with a plain integer
-- comparison instead of walking the parent chain.
--
-- NOTE: (event_definition_id, parent_node_id, branch_key) should be unique
-- per "slot", but SQLite treats each NULL in a UNIQUE index as distinct, so a
-- DB-level UNIQUE constraint here would NOT catch two root-attached
-- 'success' nodes for the same event. That invariant is enforced in
-- application code (eventDefinitionsRepo.js), not in this schema.
CREATE TABLE event_outcome_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  parent_node_id INTEGER REFERENCES event_outcome_nodes(id) ON DELETE CASCADE,
  branch_key TEXT NOT NULL CHECK (branch_key IN ('success', 'failure')),
  outcome_logic TEXT NOT NULL DEFAULT 'AND' CHECK (outcome_logic IN ('AND', 'OR')),
  depth INTEGER NOT NULL CHECK (depth >= 1)
);

-- NULL = root level (100% unchanged existing behavior). Non-null = this
-- condition/action belongs to that specific node's own condition-set/action-set.
ALTER TABLE event_conditions ADD COLUMN outcome_node_id INTEGER REFERENCES event_outcome_nodes(id) ON DELETE CASCADE;
ALTER TABLE event_actions ADD COLUMN outcome_node_id INTEGER REFERENCES event_outcome_nodes(id) ON DELETE CASCADE;
