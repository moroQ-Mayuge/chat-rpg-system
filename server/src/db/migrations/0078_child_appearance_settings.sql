-- 子の登場に関するWorld設定。「3択」ではなく2軸にしてあるのは、
-- 「時間は止まっているが子は登場する」(サザエさん空間＋早熟)のような
-- 組み合わせが成立し、1本の3択では作れないため。
--
-- 軸A キャラの加齢。
--   static = サザエさん空間。日付は進むがキャラの年齢は加算しない。
--   normal = n年後跳躍を許可する。
-- 注意: 現状 age_real は静的な列で、日々の加齢はどこにも実装されていない。
-- 加齢は跳躍時にまとめて加算すれば足りるので、この軸は跳躍を実装するまで
-- 挙動差を持たない(列だけ先に用意しておく)。
ALTER TABLE worlds ADD COLUMN character_aging TEXT NOT NULL DEFAULT 'normal'
  CHECK (character_aging IN ('static', 'normal'));

-- 軸B 子の登場。
--   none          = 記録には残るがキャラにはならない。会話の話題としてのみ存在。
--   on_time_skip  = n年後跳躍を跨いだときに登場する。
--   early         = 出産から child_maturation_days 日後に登場する(早熟)。
-- 既定を none にしてあるのは、キャラ化はルート固有キャラ(P6)を前提とするため。
ALTER TABLE worlds ADD COLUMN child_appearance TEXT NOT NULL DEFAULT 'none'
  CHECK (child_appearance IN ('none', 'on_time_skip', 'early'));

-- 早熟モデルで、出産から登場までのゲーム内日数。
ALTER TABLE worlds ADD COLUMN child_maturation_days INTEGER NOT NULL DEFAULT 30;

-- 登場時の年齢の下限・上限。実効値はこの範囲に収めたうえで、さらに母親の
-- age_real 未満に制限する(母より年上の子は出せない)。母のage_realが空の
-- 場合は上限をそのまま使う。プレイヤー側には年齢の項目自体が無いので、
-- 判定に使えるのは母の年齢だけ。
ALTER TABLE worlds ADD COLUMN child_age_min INTEGER NOT NULL DEFAULT 4;
ALTER TABLE worlds ADD COLUMN child_age_max INTEGER NOT NULL DEFAULT 6;

-- 「出産と成長の理」。worldview 本文とは別欄にしてあるのは、妊娠・出産・子が
-- 絡む場面でだけ注入したいため。大多数のセッションでは無関係で、ローカルLLMの
-- コンテキストを常時圧迫する理由がない。
ALTER TABLE worlds ADD COLUMN birth_lore TEXT NOT NULL DEFAULT '';
