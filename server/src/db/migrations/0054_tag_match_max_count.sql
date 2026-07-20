-- Per-(World,room) cap on the attribute-tag auto-match population mechanism
-- (worldRoomSlotAssignmentsRepo.js's tagMatchedCharacterIds): NULL = no cap
-- (current unlimited behavior). When set and the matching character pool
-- exceeds it, a weighted-random subset is chosen instead of everyone
-- matching. Lives on world_room_templates (not master room_templates)
-- because the matching character pool is inherently World-specific even
-- when the room's own attribute_tags are shared across Worlds.
ALTER TABLE world_room_templates ADD COLUMN tag_match_max_count INTEGER;
