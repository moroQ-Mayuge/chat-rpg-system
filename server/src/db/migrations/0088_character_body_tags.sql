-- 素体タグ(髪型以外の目の色・体形・キャラタグ等/髪型)をキャラ本体に持たせる。
-- 衣装側(outfits.main_features/hairstyle)は上書き専用として残し、値が空なら
-- ここへフォールバックする(server/src/services/outfitComposition.js)。
-- 新規列は全キャラ空のまま — 既存データの整理は別段
-- (PLAN_2026-08-02_outfit_spec_revision.md 実装順10)で扱う。
ALTER TABLE characters ADD COLUMN main_features TEXT NOT NULL DEFAULT '';
ALTER TABLE characters ADD COLUMN hairstyle TEXT NOT NULL DEFAULT '';
