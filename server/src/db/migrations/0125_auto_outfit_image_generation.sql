-- 脱衣コマンド実行時の自動画像生成ON/OFF(既定OFF)。
ALTER TABLE worlds ADD COLUMN undress_image_generation_enabled INTEGER NOT NULL DEFAULT 0;
-- 衣装の着替え(change_outfit/wear-item/wear-outfit)時の自動画像生成ON/OFF(既定OFF)。
ALTER TABLE worlds ADD COLUMN outfit_change_image_generation_enabled INTEGER NOT NULL DEFAULT 0;
-- 上記2つが共有する、キャラ単位のクールダウン(ターン数)。0で無制限(毎回生成)。
ALTER TABLE worlds ADD COLUMN auto_outfit_image_cooldown_turns INTEGER NOT NULL DEFAULT 2;
-- 直近の自動生成時のユーザーターン数(countUserTurnsForSession基準)。キャラ単位。
ALTER TABLE room_session_characters ADD COLUMN auto_outfit_image_last_turn INTEGER NOT NULL DEFAULT 0;
