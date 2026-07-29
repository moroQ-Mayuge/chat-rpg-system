-- 妊娠。受胎から出産・子の登場までを1行の状態遷移で通す。
--
-- 保存するのは日付だけで、妊娠の段階も(出産後の)成育の段階も
-- playthroughs.current_day との差分から毎回導出する(pregnancy.js)。
-- 「妊娠しやすさ」周期(0070)・季節・曜日と同じ考え方で、可変状態をどこにも
-- 持たないので、あとから日付が変わってもズレようがない。
--
-- 所有者はキャラ本体ではなくルート。characters行は複数World・複数ルートで
-- 共有されるマスタなので、「このルートでの出来事」はルート側にぶら下げる
-- (character_memories(0068)と同じ理由)。
--
-- モブキャラ(characters.is_mob)は対象外。モブは設計上セッションごとに状態が
-- リセットされる使い捨ての存在で、ルート永続の妊娠と矛盾する。
CREATE TABLE character_pregnancies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  -- 誰との子か。当面「あなた」のみ受け付けるが、将来キャラ同士を扱えるよう
  -- 名前を持てる形にしてある。
  partner TEXT NOT NULL DEFAULT 'あなた',
  conceived_day INTEGER NOT NULL,
  -- 本人が妊娠に気づいた日。NULL=未発覚で、この間はプロンプトに妊娠を載せない
  -- (拾えるアイテムを「発見して初めて」出すのと同じ考え方)。
  known_from_day INTEGER,
  ended_day INTEGER,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('出産', '流産', '中絶')),
  -- 出産時に決まる。キャラ化前でも会話で名前を呼べるようにここへ持つ。
  child_name TEXT NOT NULL DEFAULT '',
  child_gender TEXT NOT NULL DEFAULT '',
  -- 子がキャラとして登場したら埋まる(P6/P7)。キャラを消しても妊娠の記録
  -- そのものは残したいので SET NULL。
  child_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_character_pregnancies_lookup
  ON character_pregnancies(playthrough_id, character_id, ended_day);

-- World単位のopt-in(既定OFF)。cycle_enabled と同じ扱いで、既存Worldの挙動は
-- 変わらない。UIはP4で付ける。
ALTER TABLE worlds ADD COLUMN pregnancy_enabled INTEGER NOT NULL DEFAULT 0;
-- 妊娠期間(ゲーム内日数)。段階は期間に対する割合で決まるので、21日でも280日でも
-- 同じ形になる。既定84は「28日周期×3」相当だが、実プレイのペース(6073メッセージで
-- 52日)を考えると現実準拠の280日は到達しないため、World側で短く調整する前提。
ALTER TABLE worlds ADD COLUMN gestation_days INTEGER NOT NULL DEFAULT 84;
