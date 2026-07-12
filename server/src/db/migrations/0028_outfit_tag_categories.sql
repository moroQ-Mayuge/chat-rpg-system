-- 画像生成用danbooruタグを、単一のフラットな image_tags から13カテゴリへ分割。
-- 範囲プレースホルダー（upperbody/cowboyshot/lowerbody/fullbody、各 無印/_extra/_full）
-- は server/src/services/outfitTagCategories.js 側でこれらの列を組み合わせて解決する。
ALTER TABLE outfits ADD COLUMN main_features TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN hairstyle TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN clothing_main TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN clothing_face TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN clothing_upper TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN clothing_lower TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN clothing_legs TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN shoes TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN clothing_face_extra TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN clothing_upper_extra TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN clothing_lower_extra TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN clothing_legs_extra TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN belongings TEXT NOT NULL DEFAULT '';

UPDATE outfits SET main_features = image_tags;

ALTER TABLE outfits DROP COLUMN image_tags;
