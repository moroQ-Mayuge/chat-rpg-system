-- Representative/thumbnail image for a World, used e.g. in World list summary
-- displays. image_tags drives AI generation; thumbnail_image_path is the
-- resulting (or manually uploaded) image, same pattern as Outfit's standing image.
ALTER TABLE worlds ADD COLUMN image_tags TEXT NOT NULL DEFAULT '';
ALTER TABLE worlds ADD COLUMN thumbnail_image_path TEXT;
