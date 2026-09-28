-- 同席キャラの現在位置(サブ部屋、0150)。プレイヤーと同じサブ部屋にいるキャラだけが
-- 会話対象(session.participants)になり、別サブ部屋のキャラは部屋の在籍者
-- (is_active=1)のまま会話から外れる(session.elsewhere_participants)。
-- NULL=親部屋本体(メイン)。サブ部屋を持たない部屋ではセッション側も常にNULLなので、
-- 従来どおり全員が同所になる。サブ部屋が削除された時は SET NULL(セッション側と同じ)。
ALTER TABLE room_session_characters ADD COLUMN sub_room_id INTEGER REFERENCES room_sub_rooms(id) ON DELETE SET NULL;
