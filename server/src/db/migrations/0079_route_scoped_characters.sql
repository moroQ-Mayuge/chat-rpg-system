-- ルート固有キャラ(自動作成された子)。characters は World をまたいで共有される
-- マスタでルートという概念を持たないため、そのままだと純愛ルートで生まれた子が
-- ハーレムルートにも出てくる。
--
-- 2列に分けてあるのが肝。ルートを削除すると origin_playthrough_id は
-- SET NULL で外れるが、is_auto_created は残る。1列だけにすると、削除の瞬間に
-- 「ルート制約なし＝どのルートにも出る」に化けて、自宅用の属性タグを持った子が
-- 他人の家に現れる事故になる。分けておくことで「ルートが消えても資産として
-- 残るが、どこにも勝手には出てこない」が両立する。
ALTER TABLE characters ADD COLUMN origin_playthrough_id INTEGER REFERENCES playthroughs(id) ON DELETE SET NULL;

-- アプリが生成したキャラかどうか。作者が手で作ったキャラとは扱いを分ける
-- (自動出現の対象・作者向けUIの選択肢・World バンドルへの同梱)。
ALTER TABLE characters ADD COLUMN is_auto_created INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_characters_origin_playthrough ON characters(origin_playthrough_id);
