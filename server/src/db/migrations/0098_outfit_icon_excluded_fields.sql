-- 表情アイコン生成時にどのタグカテゴリを含めるか、衣装ごとに選べるようにする。
-- 除外したいOUTFIT_TAG_FIELDSのキー名をJSON配列で保持。既定'[]'は「全項目含める」
-- を意味し、既存の全キャラ・全Outfitの挙動は変わらない。立ち絵生成には使わない
-- （表情アイコン専用のスコープ）。
ALTER TABLE outfits ADD COLUMN icon_excluded_fields TEXT NOT NULL DEFAULT '[]';
