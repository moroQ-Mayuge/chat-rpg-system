-- 子キャラに付ける属性キーの決め方を3系統に分ける(0080の child_attribute_tags は
-- 「固定」としてそのまま使う)。
--
-- 親からの継承を既定OFFにしてあるのは、母のキーがそのまま子に付くと
-- 「生徒」を継いだ幼児が教室に湧くため。欲しい世界観だけがONにする。
ALTER TABLE worlds ADD COLUMN child_inherit_parent_tags INTEGER NOT NULL DEFAULT 0;

-- ランダム枠の候補。この中から child_random_tag_count 個を重複なしで選ぶ。
-- 兄弟が同じ設定から生まれても少しずつ違う子になるようにするためのもので、
-- 固定枠(child_attribute_tags)とは足し合わされる。
ALTER TABLE worlds ADD COLUMN child_random_attribute_tags TEXT NOT NULL DEFAULT '';
ALTER TABLE worlds ADD COLUMN child_random_tag_count INTEGER NOT NULL DEFAULT 1;
