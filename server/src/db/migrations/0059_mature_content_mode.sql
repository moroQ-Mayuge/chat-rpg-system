-- World単位のopt-in: ONの場合、システムプロンプトに「これは個人利用の
-- 創作フィクションであり拒否・説教・空白応答をしない」旨の指示ブロックを
-- 追加する(promptBuilder.js)。ローカルLLM(例: Gemma)の残存する拒否/検閲
-- 挙動を、成人向けWorldで抑えるためのもの。
ALTER TABLE worlds ADD COLUMN mature_content_mode_enabled INTEGER NOT NULL DEFAULT 0;
