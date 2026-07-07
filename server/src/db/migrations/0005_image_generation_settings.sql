-- Per-image-kind generation settings: prompt template (user-editable, with a
-- fixed placeholder set), canvas layout for the reference-anchor technique,
-- and the SD sampling parameters. Replaces scattered hardcoded JS constants
-- across outfitImageGenerator.js / roomBackgroundImageGenerator.js /
-- imagePromptBuilder.js so each is tunable without a code change.
--
-- default_mode: 'anchor_i2i' (reference-anchor inpainting) or 'prompt_only'
-- (plain txt2img/img2img-whole-image, no reference compositing). For kinds
-- with a manual generation button (expression), this is just the
-- pre-selected default — the user can override per click. For automatic
-- kinds (scene, event — fired without a user present), this is what's
-- actually used every time.
CREATE TABLE image_generation_settings (
  image_kind TEXT PRIMARY KEY CHECK (image_kind IN ('standing', 'expression', 'scene', 'event', 'room_background', 'world_thumbnail')),
  default_mode TEXT NOT NULL DEFAULT 'anchor_i2i' CHECK (default_mode IN ('anchor_i2i', 'prompt_only')),
  prompt_template TEXT NOT NULL DEFAULT '',
  anchor_width INTEGER NOT NULL DEFAULT 200,
  main_width INTEGER NOT NULL,
  main_height INTEGER NOT NULL,
  steps INTEGER NOT NULL DEFAULT 6,
  cfg_scale REAL NOT NULL DEFAULT 2,
  denoising_strength REAL NOT NULL DEFAULT 0.75
);

INSERT INTO image_generation_settings
  (image_kind, default_mode, prompt_template, anchor_width, main_width, main_height, steps, cfg_scale, denoising_strength)
VALUES
  ('standing', 'prompt_only', '${style_preset}, ${character_tags}, ${extra_hint}', 200, 768, 1344, 6, 2, 0.75),
  ('expression', 'anchor_i2i', '${style_preset}, ${character_tags}, 1girl, solo, upper body, room, wall, ${expression_tag}, ${extra_hint}', 200, 1216, 832, 8, 5, 0.75),
  ('scene', 'anchor_i2i', '${style_preset}, ${location_tags}, ${atmosphere_tags}, ${prop_tags}, ${character_tags}, ${extra_hint}', 200, 1216, 832, 6, 2, 0.75),
  ('event', 'anchor_i2i', '${style_preset}, ${location_tags}, ${atmosphere_tags}, ${prop_tags}, ${character_tags}, ${extra_hint}', 200, 1216, 832, 6, 2, 0.75),
  ('room_background', 'prompt_only', '${style_preset}, scenery, no humans, ${location_tags}, ${atmosphere_tags}, ${extra_hint}', 200, 1216, 832, 6, 2, 0.75),
  ('world_thumbnail', 'prompt_only', '${style_preset}, ${world_tags}, ${extra_hint}', 200, 1024, 576, 6, 2, 0.75);
