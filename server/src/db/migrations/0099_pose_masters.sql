-- ポーズ状態機構: expression_types(id/name/llm_tag_key/tag)と同じ構成の
-- 共有マスタ。room_session_charactersに現在のポーズ、room_templatesに
-- 「この部屋に入った時の初期ポーズ」を追加する。ポーズはセッションをまたいで
-- 永続化しない設計のため、outfitのようなplaythrough単位の持ち越しテーブルは
-- 作らない。
CREATE TABLE pose_masters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  llm_tag_key TEXT NOT NULL UNIQUE,
  danbooru_tag TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE room_session_characters ADD COLUMN current_pose_id INTEGER REFERENCES pose_masters(id) ON DELETE SET NULL;
ALTER TABLE room_templates ADD COLUMN default_pose_id INTEGER REFERENCES pose_masters(id) ON DELETE SET NULL;
