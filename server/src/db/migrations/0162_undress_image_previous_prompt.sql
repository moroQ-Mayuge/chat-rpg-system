-- 脱衣コマンド実行時の自動画像生成で、「対象キャラの直前に生成された画像のプロンプト」を
-- 土台にするか(既定OFF=従来どおり現在の場面からプロンプトを組み立てる)。
ALTER TABLE worlds ADD COLUMN undress_image_use_previous_prompt INTEGER NOT NULL DEFAULT 0;

-- 画像を生成した時点での、キャラごとのキャラタグ(character_tags の内訳)。
-- generated_images.prompt は全体を1本に連結した文字列で、どの部分がどのキャラのタグかを
-- 後から分けられないため、「前回のプロンプトからこのキャラのタグだけを今の状態のものに
-- 差し替える」ために生成時に記録しておく。この列ができる前に生成された画像には行が無く、
-- その場合は従来どおりの組み立てにフォールバックする。
CREATE TABLE generated_image_character_tags (
  generated_image_id INTEGER NOT NULL REFERENCES generated_images(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  tags TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (generated_image_id, character_id)
);
CREATE INDEX idx_generated_image_character_tags_character ON generated_image_character_tags(character_id);
