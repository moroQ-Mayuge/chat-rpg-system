-- 不具合報告2026-08-06項目3: 部屋のアイテムをセッション毎にリセットできるようにする
ALTER TABLE room_templates ADD COLUMN reset_items_per_session INTEGER NOT NULL DEFAULT 0;
