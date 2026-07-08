-- Per-kind negative prompt, alongside the existing prompt_template knob in
-- image_generation_settings. Previously every generation call silently used
-- koboldClient.js's hardcoded default ('worst quality, low quality') since no
-- caller ever passed negativePrompt explicitly — seeding that same value here
-- keeps generated output unchanged until the user edits it per kind.
ALTER TABLE image_generation_settings ADD COLUMN negative_prompt TEXT NOT NULL DEFAULT 'worst quality, low quality';
