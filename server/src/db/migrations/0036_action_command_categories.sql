-- 3-tier free-text categorization for action_commands, plus a status-gated
-- visibility flag. category/subcategory/sub_subcategory are plain TEXT (not
-- an enum) so future command groups (e.g. a catch-all "その他" bucket for
-- content added outside this project's scope) can be re-parented without a
-- schema change. visible_when_status_ids is a comma-separated list of
-- character_statuses.id; the command is only shown when at least one current
-- session participant currently holds one of those statuses (any_present
-- semantics, same convention as other "mentioned"/any_present fields in this
-- codebase) -- used to hide underwear-stage commands until the corresponding
-- clothing track has reached the half-undressed/none stage.
ALTER TABLE action_commands ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE action_commands ADD COLUMN subcategory TEXT NOT NULL DEFAULT '';
ALTER TABLE action_commands ADD COLUMN sub_subcategory TEXT NOT NULL DEFAULT '';
ALTER TABLE action_commands ADD COLUMN visible_when_status_ids TEXT NOT NULL DEFAULT '';
