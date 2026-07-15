-- Lets a character_statuses row declare which outfit tag columns (see
-- OUTFIT_TAG_FIELDS, server/src/db/repositories/outfitsRepo.js) should be
-- omitted from resolveOutfitTags' composed danbooru tags while that status
-- is active -- used by the undress-state ladder (exclusive_group
-- 'undress_state_upper_clothing' etc.) to make ${targetN.category} image
-- generation placeholders stop showing a clothing layer once the character's
-- current stage says it isn't there anymore.
ALTER TABLE character_statuses ADD COLUMN suppresses_outfit_fields TEXT NOT NULL DEFAULT '';
