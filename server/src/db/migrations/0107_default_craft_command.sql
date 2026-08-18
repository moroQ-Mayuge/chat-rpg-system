-- 既定のクラフトコマンド。共通(world_id NULL)の持ち物系コマンド
-- (持ち物6/拾う7/使う8/渡す9)に続く sort_order=10 で「もちもの」に並べる。
-- 省略した列は全て NOT NULL DEFAULT を持つ(0022と同じ書き方)。
INSERT INTO action_commands (world_id, label, icon, command_type, keyword_text, sort_order, category, subcategory)
VALUES (NULL, 'つくる', '🔨', 'craft', '', 10, 'もちもの', '');
