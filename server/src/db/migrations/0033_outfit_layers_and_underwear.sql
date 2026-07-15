-- Redefines the existing clothing_*_extra columns (0028_outfit_tag_categories.sql)
-- as "上着・重ね着" (outerwear/layering, e.g. jackets) rather than their prior
-- "追加装備" meaning. Existing tag data is preserved as-is (a rename, not a
-- data migration) -- reclassifying individual outfits' existing tag content
-- is left to the user at their own pace via the CharactersPage editor.
ALTER TABLE outfits RENAME COLUMN clothing_face_extra TO clothing_face_outer;
ALTER TABLE outfits RENAME COLUMN clothing_upper_extra TO clothing_upper_outer;
ALTER TABLE outfits RENAME COLUMN clothing_lower_extra TO clothing_lower_outer;
ALTER TABLE outfits RENAME COLUMN clothing_legs_extra TO clothing_legs_outer;

-- New, genuinely-separate "追加装備" columns (armor, gun holsters, etc. --
-- non-everyday items distinct from outerwear).
ALTER TABLE outfits ADD COLUMN clothing_face_equipment TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN clothing_upper_equipment TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN clothing_lower_equipment TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN clothing_legs_equipment TEXT NOT NULL DEFAULT '';

-- New underwear columns. underwear_lower is intended to also cover swimwear.
-- Deliberately excluded from every range preset (see outfitTagCategories.js),
-- same treatment as belongings -- only individually addressable via
-- ${target1.underwear_upper} / ${target1.underwear_lower}.
ALTER TABLE outfits ADD COLUMN underwear_upper TEXT NOT NULL DEFAULT '';
ALTER TABLE outfits ADD COLUMN underwear_lower TEXT NOT NULL DEFAULT '';
