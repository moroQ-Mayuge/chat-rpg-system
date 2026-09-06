-- [SCENE_CHANGE]の日本語描写をdanbooruタグに変換する中間ステップ(suggestSceneTags)の
-- システムプロンプトを編集可能にする。sceneのimage_generation_settings行にのみ意味を
-- 持つが、他のkindと同じ列構成を保つため全行に追加する。既定値はこれまでの
-- ハードコード文をそのまま初期値にして、既存の挙動を変えない。
ALTER TABLE image_generation_settings ADD COLUMN scene_tag_translation_prompt TEXT NOT NULL DEFAULT '以下の日本語のシーン描写を、画像生成に使うdanbooruタグに変換してください。
出力は半角カンマ区切りの英単語タグのみとし、日本語・説明文・見出し・表・箇条書き記号は一切含めないでください。
出力形式の例：classroom, indoors, window, sunset, empty_desks';
