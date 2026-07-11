-- Item行動コマンドの自由拡張: item_use種別のコマンドを「使う」1つに固定せず
-- 複数定義できるようにするため、消費・譲渡の挙動をコマンド単位で持たせる。
-- 両カラムはitem_use種別のコマンドでのみ意味を持つ。
ALTER TABLE action_commands ADD COLUMN consumes_item INTEGER NOT NULL DEFAULT 0;
ALTER TABLE action_commands ADD COLUMN transfers_to_target INTEGER NOT NULL DEFAULT 0;

-- 既存の「渡す」相当の使い勝手を維持するため、item_use種別の既存コマンドと同じ
-- Worldスコープで「渡す」コマンドを追加する（共通スコープの既存item_use行があれば
-- それぞれの世界に対して同様のものを用意）。
INSERT INTO action_commands (world_id, label, icon, command_type, keyword_text, sort_order, consumes_item, transfers_to_target)
SELECT world_id, '渡す', '🤝', 'item_use', '', sort_order + 1, 0, 1
FROM action_commands
WHERE command_type = 'item_use';
