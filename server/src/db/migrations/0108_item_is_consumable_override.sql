-- アイテム個別の消費型上書き。NULL = カテゴリ(item_categories.is_consumable)の
-- 設定に従う(既存アイテムは全てNULLなので挙動が変わらない)、1/0 = 個別指定。
-- クラフト時にLLMが完成品ごとに判定した結果を保存するために使う。
ALTER TABLE items ADD COLUMN is_consumable INTEGER;
