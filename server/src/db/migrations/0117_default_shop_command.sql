-- 既定の買い物コマンド。共通(world_id NULL)の持ち物系コマンド
-- (持ち物6/拾う7/使う8/渡す9/つくる10)に続く sort_order=11 で「もちもの」に並べる。
-- LLMの判断を介さない確定的な購入・入手経路(ShopPanel)を開く。
INSERT INTO action_commands (world_id, label, icon, command_type, keyword_text, sort_order, category, subcategory)
VALUES (NULL, '買い物', '🛍️', 'shop', '', 11, 'もちもの', '');
