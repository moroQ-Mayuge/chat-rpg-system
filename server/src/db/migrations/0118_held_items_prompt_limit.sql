-- プロンプトに載せるNPC所持アイテム名(取得が新しい順)の件数上限。
-- 0なら軽量な自動差し込みを行わない(機能OFF、既定)。「持ち物確認」コマンド
-- による全件表示はこの設定と独立して常に機能する。
ALTER TABLE worlds ADD COLUMN held_items_prompt_limit INTEGER NOT NULL DEFAULT 0;
