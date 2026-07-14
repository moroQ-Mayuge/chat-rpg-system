-- Expression types currently reuse llm_tag_key (the LLM-facing [EMOTION:xxx]
-- identifier) as the image-generation prompt variable too (see
-- outfitImageGenerator.js's expression_tag). This adds a distinct,
-- image-generation-facing tag so the two concerns can diverge; empty means
-- "fall back to llm_tag_key" (existing rows/behavior unaffected).
ALTER TABLE expression_types ADD COLUMN danbooru_tag TEXT NOT NULL DEFAULT '';
