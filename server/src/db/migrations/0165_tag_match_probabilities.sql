-- 属性タグ自動出現(tag match)の「順位別の出現確率」。JSON配列(各0〜1)で、重み
-- (characters.event_participation_weight)の大きい順に並べた i 番目のキャラが
-- 配列の i 番目の確率で出現する(配列より後ろは最後の値)。例: [1, 0.8, 0.6, 0.5, 0.4]
-- は「1人目は必ず、2人目は80%…」。NULL/空=従来どおり全員が出る。
-- 日替わりプロファイルのタグで決まる出演者を、毎回同じ顔ぶれにせず揺らすために使う。
ALTER TABLE world_room_templates ADD COLUMN tag_match_probabilities TEXT;
