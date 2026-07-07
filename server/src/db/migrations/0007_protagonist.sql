-- The human user has no in-system identity at all: NPCs each know how they
-- personally address "you" (characters.call_user_as), but nothing tells the
-- LLM who "you" fundamentally are, so it can't write consistent narration or
-- NPC reactions involving the protagonist. Deliberately excludes personality/
-- speech-style fields — the player controls how they act and talk purely
-- through their own typed lines, and these fields must not constrain that.
--
-- World holds the default; a Playthrough (Route) can either inherit it
-- (use_custom_protagonist = 0, the protagonist_* columns unused) or define
-- its own (use_custom_protagonist = 1), mirroring the existing
-- default-at-World / override-at-Playthrough pattern used elsewhere.
ALTER TABLE worlds ADD COLUMN protagonist_name TEXT NOT NULL DEFAULT '';
ALTER TABLE worlds ADD COLUMN protagonist_nickname TEXT NOT NULL DEFAULT '';
ALTER TABLE worlds ADD COLUMN protagonist_occupation TEXT NOT NULL DEFAULT '';
ALTER TABLE worlds ADD COLUMN protagonist_appearance TEXT NOT NULL DEFAULT '';
ALTER TABLE worlds ADD COLUMN protagonist_notes TEXT NOT NULL DEFAULT '';

ALTER TABLE playthroughs ADD COLUMN use_custom_protagonist INTEGER NOT NULL DEFAULT 0;
ALTER TABLE playthroughs ADD COLUMN protagonist_name TEXT NOT NULL DEFAULT '';
ALTER TABLE playthroughs ADD COLUMN protagonist_nickname TEXT NOT NULL DEFAULT '';
ALTER TABLE playthroughs ADD COLUMN protagonist_occupation TEXT NOT NULL DEFAULT '';
ALTER TABLE playthroughs ADD COLUMN protagonist_appearance TEXT NOT NULL DEFAULT '';
ALTER TABLE playthroughs ADD COLUMN protagonist_notes TEXT NOT NULL DEFAULT '';
