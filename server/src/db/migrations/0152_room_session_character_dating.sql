-- 同行の3段階目「デート中」(なし < 同行中 < デート中)。is_dating=1 のキャラは
-- is_accompanying=1 も含意し(解散/同行解除で両方0に戻る)、サブ部屋(0150)への移動で
-- 判定なしに必ずプレイヤーと一緒に移る。同行中(is_accompanying=1のみ)は@メンションが
-- 無ければ元の場所で待機する。既存の is_accompanying の参照箇所を変えずに済むよう
-- 別列にしている。
ALTER TABLE room_session_characters ADD COLUMN is_dating INTEGER NOT NULL DEFAULT 0;
