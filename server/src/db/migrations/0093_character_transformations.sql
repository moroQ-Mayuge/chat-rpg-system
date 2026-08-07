-- character_transformations: 1キャラに紐づく変身後アイデンティティの定義。
-- outfit_masters と違い複数キャラで共有しない(あるキャラの変身先はそのキャラ
-- 専用)。各列は空なら合成時に素のキャラの値へフォールバックする
-- (outfitsのマスタ/インスタンス関係と同じ「空欄は継承」規約)。
CREATE TABLE character_transformations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL DEFAULT '',
  appearance_features TEXT NOT NULL DEFAULT '',
  eye_description TEXT NOT NULL DEFAULT '',
  hair_description TEXT NOT NULL DEFAULT '',
  body_type TEXT NOT NULL DEFAULT '',
  bust_description TEXT NOT NULL DEFAULT '',
  physical_features TEXT NOT NULL DEFAULT '',
  main_features TEXT NOT NULL DEFAULT '',
  hairstyle TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL DEFAULT '',
  first_person TEXT NOT NULL DEFAULT '',
  speech_style TEXT NOT NULL DEFAULT '',
  sentence_ending TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  special_skills TEXT NOT NULL DEFAULT '',
  outfit_master_id INTEGER REFERENCES outfit_masters(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE room_session_characters ADD COLUMN current_transformation_id INTEGER REFERENCES character_transformations(id) ON DELETE SET NULL;

-- playthrough_character_outfit(実装順8)と同型: ルート単位で「今どの変身
-- 状態か」を持続する。
CREATE TABLE playthrough_character_transformation (
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  transformation_id INTEGER REFERENCES character_transformations(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (playthrough_id, character_id)
);
