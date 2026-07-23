-- Purely cosmetic labels for the outcome-branch UI redesign (nested boxes ->
-- flat outline list): lets an author name the root outcome judgment and
-- each nested node (e.g. "条件群A", "条件群A-1"), shown instead of a bare
-- "成功時"/"失敗時" placeholder and referenced by the separated actions
-- section to show which condition group an action is bound to. Empty
-- string (the default) falls back to a generic display label client-side;
-- neither column is read by eventEngine/index.js's evaluation logic.
ALTER TABLE event_definitions ADD COLUMN outcome_root_label TEXT NOT NULL DEFAULT '';
ALTER TABLE event_outcome_nodes ADD COLUMN label TEXT NOT NULL DEFAULT '';
