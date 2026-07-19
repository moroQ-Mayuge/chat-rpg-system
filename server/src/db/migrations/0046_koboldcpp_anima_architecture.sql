-- Lets the KoboldCpp launcher target the Anima (Cosmos-Predict2-based anime
-- image model) architecture, which needs a separate VAE and CLIP text
-- encoder file alongside the main SD model (--sdvae/--sdclip1), unlike the
-- plain SD architecture which only needs --sdmodel.
ALTER TABLE koboldcpp_launch_settings ADD COLUMN sd_architecture TEXT NOT NULL DEFAULT 'sd' CHECK (sd_architecture IN ('sd', 'anima'));
ALTER TABLE koboldcpp_launch_settings ADD COLUMN sd_vae_path TEXT;
ALTER TABLE koboldcpp_launch_settings ADD COLUMN sd_clip1_path TEXT;
