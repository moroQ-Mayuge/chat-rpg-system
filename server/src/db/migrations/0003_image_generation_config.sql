-- Image style presets: reusable named prompt fragments (art style / quality
-- tags / artist names etc.) that get prepended to every image generation
-- call. A World can pick one explicitly; if it doesn't, generation falls
-- back to whichever preset has is_default = 1.
CREATE TABLE image_style_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  prompt_text TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE worlds ADD COLUMN image_style_preset_id INTEGER REFERENCES image_style_presets(id) ON DELETE SET NULL;

-- Per-image-kind output format. 'standing'/'expression' are Outfit assets
-- (Characters page); 'scene'/'event' mirror generated_images.type.
CREATE TABLE image_format_settings (
  image_kind TEXT PRIMARY KEY CHECK (image_kind IN ('standing', 'expression', 'scene', 'event')),
  format TEXT NOT NULL DEFAULT 'png' CHECK (format IN ('png', 'jpg'))
);

INSERT INTO image_style_presets (name, prompt_text, is_default) VALUES ('デフォルト', 'masterpiece, best quality', 1);

INSERT INTO image_format_settings (image_kind, format) VALUES
  ('standing', 'png'),
  ('expression', 'png'),
  ('scene', 'png'),
  ('event', 'png');
