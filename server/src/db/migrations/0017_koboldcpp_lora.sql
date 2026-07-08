-- SD LoRA selection for the in-app KoboldCpp launcher: lets a speed-up LoRA
-- (e.g. an SDXL-Lightning-style checkpoint, per SPEC.md's image-generation
-- speed strategy) be applied to SD checkpoints that don't already bake one
-- in. KoboldCpp supports this natively via --sdlora/--sdloramult.
ALTER TABLE koboldcpp_launch_settings ADD COLUMN sd_lora_path TEXT;
ALTER TABLE koboldcpp_launch_settings ADD COLUMN sd_lora_multiplier REAL NOT NULL DEFAULT 1.0;
