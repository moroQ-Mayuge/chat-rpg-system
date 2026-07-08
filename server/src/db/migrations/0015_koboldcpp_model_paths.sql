-- Manual model path override (chat enhancement follow-up item 16): the
-- launcher currently auto-detects the first .gguf/.safetensors file under
-- koboldcpp/models/llm and koboldcpp/models/sd. User chose a direct
-- path-text-input UX over a folder-scan dropdown — empty/null means "keep
-- using the existing auto-detect behavior".
ALTER TABLE koboldcpp_launch_settings ADD COLUMN llm_model_path TEXT;
ALTER TABLE koboldcpp_launch_settings ADD COLUMN sd_model_path TEXT;
