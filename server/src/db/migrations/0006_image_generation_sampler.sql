-- Per-kind SD sampler selection, alongside the existing steps/cfg_scale/
-- denoising_strength knobs in image_generation_settings.
ALTER TABLE image_generation_settings ADD COLUMN sampler_name TEXT NOT NULL DEFAULT 'Euler a';
