-- Single-row settings table (same shape as chat_input_settings) controlling
-- whether generated-image chat messages show a collapsible "prompt used"
-- section. Default 0 (hidden) -- opt-in debugging/verification aid.
CREATE TABLE image_prompt_display_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  show_image_generation_prompt INTEGER NOT NULL DEFAULT 0
);

INSERT INTO image_prompt_display_settings (id) VALUES (1);
