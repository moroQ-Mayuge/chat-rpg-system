-- Character attribute-key auto-matching (chat enhancement backlog item 23):
-- free-form tags on characters, worlds, and room templates (e.g. "学生",
-- "幼馴染"), matched by simple string overlap — same comma-separated-TEXT
-- convention already used for image_tags, rather than a normalized tags
-- table, since this app has no need for tag renaming/uniqueness enforcement
-- and the existing TagChips UI component already works directly against a
-- comma-separated string.
ALTER TABLE characters ADD COLUMN attribute_tags TEXT NOT NULL DEFAULT '';
ALTER TABLE worlds ADD COLUMN attribute_tags TEXT NOT NULL DEFAULT '';
ALTER TABLE room_templates ADD COLUMN attribute_tags TEXT NOT NULL DEFAULT '';
