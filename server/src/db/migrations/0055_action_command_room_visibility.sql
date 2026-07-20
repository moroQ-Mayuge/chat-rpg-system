-- Room-based visibility condition for action_commands, mirroring
-- visible_when_status_ids exactly: comma-separated room_templates ids,
-- any_present semantics (command shows if the current room is in the list).
-- Combined with visible_when_status_ids via AND (each column internally OR).
ALTER TABLE action_commands ADD COLUMN visible_when_room_template_ids TEXT NOT NULL DEFAULT '';
