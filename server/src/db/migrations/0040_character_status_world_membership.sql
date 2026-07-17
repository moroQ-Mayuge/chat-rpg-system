-- character_statuses becomes shared master data, same pattern as
-- world_room_templates for rooms (0030_room_world_decoupling.sql): a status
-- with no rows in world_character_statuses is common (usable everywhere,
-- same as the old world_id IS NULL tier); a status with rows is scoped to
-- exactly those Worlds. This replaces the old world_id-per-row scheme, which
-- forced Worlds wanting the "same" status to duplicate the row entirely
-- (see [[character_world_membership_and_list_ui_backlog]] item 5).
CREATE TABLE world_character_statuses (
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  status_id INTEGER NOT NULL REFERENCES character_statuses(id) ON DELETE CASCADE,
  PRIMARY KEY (world_id, status_id)
);

-- Migrate existing per-World statuses into the junction table. Statuses that
-- were already common (world_id IS NULL) get zero rows, which is exactly
-- the "common" state under the new scheme too.
INSERT INTO world_character_statuses (world_id, status_id)
  SELECT world_id, id FROM character_statuses WHERE world_id IS NOT NULL;

-- character_statuses.world_id itself is left in place (unused by app code
-- from this point on) -- physical removal deferred to a later cleanup
-- migration, mirroring 0030/0032_room_world_decoupling_cleanup.sql's
-- additive-then-cleanup two-step design.
