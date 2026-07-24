-- L3.2: 衣装ごとに「どの乱れ操作(open/pull/lift/aside)が視覚的に成立するか」を
-- チェックボックスで設定できるようにする。OUTFIT_TAG_FIELDS名 -> 許可スタイル
-- キー配列 のJSONマップ（worlds.weather_tag_map等と同じ「TEXT列にJSON文字列」
-- パターン）。想定される対象は6フィールド（*_outer/base×upper/lower + underwear
-- ×upper/lower）のみだが、フィールド名ベースの汎用マップにしておく。
ALTER TABLE outfits ADD COLUMN garment_operations TEXT NOT NULL DEFAULT '{}';

-- 「破る」はopen/pull/lift/asideと排他ではなく併用可能な独立フラグ。対象フィールドは
-- 既存のdisturbs_outfit_fieldと共有する（1ステータス=1フィールドという既存設計を
-- 維持し、そのフィールドに対して「スタイル」と「torn」を独立に立てられるようにする）。
ALTER TABLE character_statuses ADD COLUMN disturbs_torn INTEGER NOT NULL DEFAULT 0;
