-- アプリからkoboldcppを起動する際の--contextsize。従来は
-- koboldcppLauncher.jsに8192が直書きされていた。
--
-- この値はプロンプト側にも効く: promptBuilder.jsは実際のコンテキスト長を
-- koboldcppに問い合わせて履歴の保持量を決めるが、koboldcppが停止中で
-- 問い合わせできない場合のフォールバック値としてここを参照する。
-- 大きくするほど履歴を長く保てるがVRAMを消費する。
ALTER TABLE koboldcpp_launch_settings ADD COLUMN context_size INTEGER NOT NULL DEFAULT 8192;
