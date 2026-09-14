-- 呼び方(character_address_states)の自動更新。既存のimpression_auto_update_enabled/
-- memory_auto_extract_enabledと同じopt-inトグル、既定OFF。
ALTER TABLE worlds ADD COLUMN address_auto_update_enabled INTEGER NOT NULL DEFAULT 0;
