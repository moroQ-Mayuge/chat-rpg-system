-- Simple attach/detach membership for characters, same shape as
-- world_character_statuses (0040) / world_room_templates (0030). This is
-- deliberately the SIMPLE scope only: a plain junction row, no per-World
-- diff overrides and no portable/environment-independent identifier (see
-- character_world_membership_and_list_ui_backlog item 1) -- those remain
-- separate, undesigned future work. charactersRepo.js's listCharacters()
-- unions this with its two existing derived world_ids sources (fixed
-- world_room_slot_assignments rows, attribute-tag matching) rather than
-- replacing them, so no backfill is needed here -- an unattached character
-- keeps showing up via the existing derivation.
CREATE TABLE world_characters (
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  PRIMARY KEY (world_id, character_id)
);
