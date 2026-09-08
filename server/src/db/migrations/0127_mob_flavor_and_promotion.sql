-- モブのランダムペルソナ付与用プリセット(Worldごと)。1プリセット=名前・口調・
-- 性格などをセットにした1ペルソナ一式。is_generatedはLLM生成モードが自動で
-- 作った行(手動登録は0)。
CREATE TABLE mob_flavor_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  personality TEXT NOT NULL DEFAULT '',
  speech_style TEXT NOT NULL DEFAULT '',
  sentence_ending TEXT NOT NULL DEFAULT '',
  first_person TEXT NOT NULL DEFAULT '',
  call_user_as TEXT NOT NULL DEFAULT '',
  call_others_as TEXT NOT NULL DEFAULT '',
  is_generated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_mob_flavor_presets_world ON mob_flavor_presets(world_id);

-- この機能自体のON/OFF(既定OFF)と、ペルソナの決め方(プリセット抽選/LLM都度生成)。
ALTER TABLE worlds ADD COLUMN mob_random_flavor_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE worlds ADD COLUMN mob_flavor_generation_mode TEXT NOT NULL DEFAULT 'preset'
  CHECK (mob_flavor_generation_mode IN ('preset', 'llm'));

-- 部屋登場時に抽選/生成されたペルソナをこの参加インスタンスに紐づける。
-- LLM生成モードでは生成完了までNULLのまま(非同期、seedParticipantsForRoom参照)。
ALTER TABLE room_session_characters ADD COLUMN mob_flavor_preset_id INTEGER REFERENCES mob_flavor_presets(id);

-- お気に入り登録で実体化したモブ由来キャラ。子キャラ(is_auto_created)と同じ
-- ルート専用キャラだが、キャラエディタには常に非表示にする(子キャラの
-- hideRouteScopedのような任意トグルではなく無条件除外)。
ALTER TABLE characters ADD COLUMN is_promoted_mob INTEGER NOT NULL DEFAULT 0;
