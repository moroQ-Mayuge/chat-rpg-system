-- サブ部屋(0150)別の出現枠(Stage 5)。枠(room_template_participant_slots)を特定の
-- サブ部屋に紐付けられるようにする——例:「店員」枠をレジ横のサブ部屋に固定。
-- NULL=従来どおり(入室時のプレイヤーの開始位置と同じ場所)。room_sessions.sub_room_id
-- と同じ「素のnullable FK、ON DELETE SET NULL」の運用(ここは全置換の子リストで
-- キャッシュのON CONFLICTも絡まないため、Stage3の番兵方式は不要)。
ALTER TABLE room_template_participant_slots ADD COLUMN sub_room_id INTEGER REFERENCES room_sub_rooms(id) ON DELETE SET NULL;
