-- 部屋ごとの衣装入手方法。'shop'は既存のis_shop(アイテムと共通)+World通貨が
-- 前提の有料入手、'pickup'は新設の無料入手（「衣裳部屋」向け）、'none'が既定
-- (既存の全部屋はこれになる＝挙動は変わらない)。
ALTER TABLE room_templates ADD COLUMN outfit_acquisition_mode TEXT NOT NULL DEFAULT 'none'
  CHECK (outfit_acquisition_mode IN ('none', 'shop', 'pickup'));

-- 品揃えの絞り込み。空なら(is_not_for_saleでない)全衣装が対象、指定時は
-- 衣装側outfit_masters.attribute_tagsと1つでも一致するものだけ対象
-- (attributeTagMatching.jsのparseAttributeTags/tagsOverlapで判定)。
ALTER TABLE room_templates ADD COLUMN outfit_attribute_tags TEXT NOT NULL DEFAULT '';
