-- LLMの[SCENE_CHANGE]タグ検知による自動シーン画像生成のON/OFF。既存の全Worldで
-- 常時有効だった挙動なので、既定は1(有効)にして今までどおりの挙動を維持する
-- (pose_enabled等の新規オプトイン機能とは逆に、既存の常時有効機能へのOFFスイッチのため)。
ALTER TABLE worlds ADD COLUMN scene_change_enabled INTEGER NOT NULL DEFAULT 1;
