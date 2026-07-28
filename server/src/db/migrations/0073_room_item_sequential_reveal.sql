-- 探索1回で部屋の中身が全部出てしまうのを、1回につき1つずつ見つかる形にする。
-- 発見時の抽選(3〜5件)はそのままだが、抽選結果は未公開(revealed=0)で入れて
-- おき、調べるたびに1件ずつ公開する。拾える一覧は公開済みのみを対象にする。
--
-- 既定を1にしてあるので、既存行(ITEM_GRANT・イベント経由で入ったもの含む)は
-- 公開済み扱いのまま影響を受けない。
ALTER TABLE playthrough_room_available_items ADD COLUMN revealed INTEGER NOT NULL DEFAULT 1;
