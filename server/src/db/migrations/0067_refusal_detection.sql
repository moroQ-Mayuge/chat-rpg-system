-- World単位のopt-in: ONの場合、生成された応答がまるごと1ブロックの拒否文
-- パターンに一致したら画面表示・履歴保存をせず、一時的な「応答なし」通知
-- だけを出す（mature_content_mode_enabledの事後検知版）。
ALTER TABLE worlds ADD COLUMN refusal_detection_enabled INTEGER NOT NULL DEFAULT 0;
