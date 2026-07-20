-- Free-text "current scene situation" an event can set at runtime (e.g.
-- "${target1}と二人きりでイチャイチャしてる"), surfaced to the LLM alongside
-- 場所/雰囲気. Scoped to the room session (not the room template or
-- playthrough) so it naturally resets when the player moves rooms (a new
-- room_sessions row is created on move) without any extra reset logic.
ALTER TABLE room_sessions ADD COLUMN current_scene_situation TEXT NOT NULL DEFAULT '';
