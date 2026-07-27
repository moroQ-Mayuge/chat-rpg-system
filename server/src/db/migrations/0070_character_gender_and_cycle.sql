-- 性別。このアプリのキャラは暗黙的に女性想定だが、モデルによっては明示
-- しないと認識できないため、キャラシート(characterSheetFormat.js)に載せる
-- 明示的な項目として持たせる。
ALTER TABLE characters ADD COLUMN gender TEXT NOT NULL DEFAULT '';

-- 「妊娠しやすさ」周期(fertilityCycle.js)をこのキャラに持たせるか。
-- 年齢や性別文字列からアプリが推測すると意図しないキャラに付いてしまうので、
-- 作者が明示的にopt-inする形にする。
ALTER TABLE characters ADD COLUMN cycle_enabled INTEGER NOT NULL DEFAULT 0;
-- 周期の初日をキャラごとにずらす日数。全員が同じ日に同じ段階になる不自然さを
-- 避けるためのもの。剰余で使うので周期長を超えていても問題ない。
ALTER TABLE characters ADD COLUMN cycle_offset_day INTEGER NOT NULL DEFAULT 0;

-- World単位のopt-in(既定OFF)と周期長。周期長はゲームの進行ペースに合わせて
-- 短縮できるよう可変にしてある(段階は周期長に対する割合で決まるため、
-- 14日でも28日でも同じ形になる)。
ALTER TABLE worlds ADD COLUMN cycle_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE worlds ADD COLUMN cycle_length_days INTEGER NOT NULL DEFAULT 28;

-- 既存キャラの性別バックフィル。19歳以上を大人(女性)、それ未満を少女とする。
-- 18歳の2名はどちらも高校3年生なので少女側に入る(学校区分と一致する境界)。
UPDATE characters SET gender = CASE
  WHEN CAST(age_real AS INTEGER) >= 19 THEN '女性'
  ELSE '少女'
END;

-- 位相の初期分散。IDから決定的に散らすだけで、あとから編集可能。
UPDATE characters SET cycle_offset_day = (id * 7) % 28;
