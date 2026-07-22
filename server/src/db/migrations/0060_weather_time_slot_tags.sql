-- Per-World danbooru-tag mapping for weather_options/time_slot_labels
-- entries (JSON object keyed by the existing free-text label, e.g.
-- {"曇り":"cloudy"}), so image generation can pull in a weather/time-of-day
-- tag alongside the existing location/atmosphere/prop/character tags. A
-- label-keyed map (rather than an index-aligned parallel array) keeps
-- working correctly if an admin reorders/edits weather_options or
-- time_slot_labels later.
ALTER TABLE worlds ADD COLUMN weather_tag_map TEXT NOT NULL DEFAULT '{}';
ALTER TABLE worlds ADD COLUMN time_slot_tag_map TEXT NOT NULL DEFAULT '{}';
