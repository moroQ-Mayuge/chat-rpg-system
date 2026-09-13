-- プレイヤーの体が同時に複数キャラへ占有される矛盾描写(例：AともBとも同時に
-- キスしている)を防ぐための、モデル自己申告の一行状態。current_scene_situation
-- (0052)と同じくroom_sessionsに直接持たせ、部屋移動で自動的にリセットされる
-- ようにする(新しいroom_sessions行になるため)。

ALTER TABLE room_sessions ADD COLUMN current_player_state TEXT NOT NULL DEFAULT '';

-- 既定ON——新機能というより矛盾描写を防ぐ補正のため、scene_change_enabled同様
-- デフォルトで効かせる。タグの追加指示自体を望まないWorldはOFFにできる。
ALTER TABLE worlds ADD COLUMN player_state_tracking_enabled INTEGER NOT NULL DEFAULT 1;
