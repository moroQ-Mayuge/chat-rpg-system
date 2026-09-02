-- 既定の持ち物確認コマンド。もちもの内、買い物(sort_order=11)に続くsort_order=12。
-- command_type='keyword'なので、クリックすると下記keyword_textがそのままチャット
-- 送信される(「待つ」のNON_EXPLORING_KEYWORDと同じ仕組み)。roomSessions.js側で
-- この文字列を検知してisInventoryCheckをONにする。
INSERT INTO action_commands (world_id, label, icon, command_type, keyword_text, sort_order, category, subcategory)
VALUES (NULL, '持ち物確認', '📋', 'keyword', '（今ここにいる皆が今何を持っているか、それとなく確認してほしい）', 12, 'もちもの', '');
