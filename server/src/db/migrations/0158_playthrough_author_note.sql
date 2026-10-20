ALTER TABLE playthroughs ADD COLUMN author_note TEXT NOT NULL DEFAULT '';
ALTER TABLE playthroughs ADD COLUMN author_note_mode TEXT NOT NULL DEFAULT 'append' CHECK (author_note_mode IN ('append', 'override'));
