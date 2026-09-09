-- モブのランダムペルソナ機能を3択に統合する。旧来は
-- mob_random_flavor_enabled(ON/OFF)+mob_flavor_generation_mode('preset'/'llm')
-- の2列でOFF時に「従来通り(ペルソナ無し・モブは同行不可)」を表現できなかった。
-- 'off'=従来通り / 'preset'=プリセット抽選 / 'llm'=LLM都度生成。
ALTER TABLE worlds ADD COLUMN mob_flavor_mode TEXT NOT NULL DEFAULT 'off'
  CHECK (mob_flavor_mode IN ('off', 'preset', 'llm'));

UPDATE worlds
SET mob_flavor_mode = CASE WHEN mob_random_flavor_enabled = 1 THEN mob_flavor_generation_mode ELSE 'off' END;

-- 旧2列(mob_random_flavor_enabled, mob_flavor_generation_mode)は以後
-- worldsRepo.js等では読み書きしない。SQLiteの列削除は互換性維持のためここでは
-- 行わず、そのまま残す(将来のデータ調査用の痕跡としても無害)。
