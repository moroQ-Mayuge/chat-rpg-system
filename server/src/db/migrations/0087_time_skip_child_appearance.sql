-- 世界観設定「子の登場」= on_time_skip(跳躍時に登場する)の判定材料。
--
-- 早熟(early)は「出産からの経過日数」で機械的に導出できるが、on_time_skip は
-- 「時間跳躍という行為が起きたこと」自体が条件で、日数の差分だけでは
-- 導出できない。跳躍の大小は問わない(1日の跳躍でも成立する)ので、
-- 「最後に time_skip アクションが実行された時点の current_day」だけ覚えておけば
-- 十分——出産日より後に跳躍が起きていれば登場可能、という比較に使う。
ALTER TABLE playthroughs ADD COLUMN last_time_skip_day INTEGER;
