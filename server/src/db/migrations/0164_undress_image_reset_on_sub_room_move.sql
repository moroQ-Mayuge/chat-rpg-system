-- 「直前の画像のプロンプトを元にする」(0162)の参照を、サブ部屋の移動でもリセットするか
-- (既定OFF=サブ部屋の移動ではリセットしない。部屋間移動では常にリセット、0163)。
ALTER TABLE worlds ADD COLUMN undress_image_reset_on_sub_room_move INTEGER NOT NULL DEFAULT 0;
