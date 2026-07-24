-- L3.4: 各行動コマンドが「どの階層(field)の、どの操作(style)」を表すかを直接
-- 宣言する。character_statuses側のdisturbs_outfit_field/disturbance_style/
-- disturbs_tornと同じ語彙だが、コマンド→イベント→ステータスの紐付けが
-- キーワード文字列一致(間接的)のため、クライアント側で直接参照できるよう
-- コマンド側にも複製する。disturbance_target_style:
-- 'open'|'pull'|'lift'|'aside'|'torn'|'complete'|''(対象外、既存コマンド無関係)。
-- 空文字なら従来通りの静的visible_when_status_ids等のみで判定される。
ALTER TABLE action_commands ADD COLUMN disturbance_target_field TEXT NOT NULL DEFAULT '';
ALTER TABLE action_commands ADD COLUMN disturbance_target_style TEXT NOT NULL DEFAULT '';
