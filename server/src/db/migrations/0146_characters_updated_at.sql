-- キャラ一覧画面のソート機能(更新日順)用。既存行は作成日を初期値にしておく
-- (SQLiteのALTER TABLE ... ADD COLUMNはリテラル/定数式のみ許可され、
-- CURRENT_TIMESTAMP等の非定数デフォルトは新規行にしか効かないため、
-- 既存行へは別途UPDATEで反映する)。
ALTER TABLE characters ADD COLUMN updated_at TEXT;
UPDATE characters SET updated_at = created_at WHERE updated_at IS NULL;
