-- Two protagonist refinements:
--  1. protagonist_gender: a plain field alongside name/nickname/occupation/
--     appearance/notes, so NPC narration can use correct pronouns (also
--     needed to represent e.g. yuri-oriented setups with a female protagonist).
--  2. protagonist_mode: 'character' (the protagonist is a present person in
--     the scene, per the existing feature) vs 'narrator' (the human user is
--     not a character at all — a god/GM-like viewpoint that can directly
--     dictate scene/NPC behavior, matching how the app behaved before the
--     protagonist feature existed). Mirrors the existing World-default /
--     Playthrough-override pattern; 'narrator' mode ignores the other
--     protagonist_* fields entirely.
ALTER TABLE worlds ADD COLUMN protagonist_gender TEXT NOT NULL DEFAULT '';
ALTER TABLE worlds ADD COLUMN protagonist_mode TEXT NOT NULL DEFAULT 'character' CHECK (protagonist_mode IN ('character', 'narrator'));

ALTER TABLE playthroughs ADD COLUMN protagonist_gender TEXT NOT NULL DEFAULT '';
ALTER TABLE playthroughs ADD COLUMN protagonist_mode TEXT NOT NULL DEFAULT 'character' CHECK (protagonist_mode IN ('character', 'narrator'));
