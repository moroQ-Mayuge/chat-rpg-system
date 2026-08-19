-- LLMモデル評価・自動テスト基盤(第1段)。
-- スクリプト化した会話シナリオを複数モデルへ同条件で流し、決定的なルールで
-- 採点して比較するための3テーブル。

CREATE TABLE model_eval_scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  room_template_id INTEGER REFERENCES room_templates(id) ON DELETE CASCADE,
  -- JSON配列。出演キャラ(room_templateの自動出現に任せず明示的に固定する)
  character_ids TEXT NOT NULL DEFAULT '[]',
  -- JSON配列。各要素 = { user_message, expect_keywords[], forbid_keywords[],
  --   expect_refusal_by[], expect_speakers[], expect_tags[], fixed_strings[] }
  turns TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE model_eval_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  -- auto = モデルを順に切り替える / current = 今ロード中のモデルだけ評価
  mode TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'current')),
  model_names TEXT NOT NULL DEFAULT '[]',
  repetitions INTEGER NOT NULL DEFAULT 1,
  -- 全モデル共通に固定したサンプラー6項目(公平な比較のため実行時に固定する)
  sampler_settings TEXT NOT NULL DEFAULT '{}',
  weights TEXT NOT NULL DEFAULT '{}',
  progress_done INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER NOT NULL DEFAULT 0,
  current_label TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE model_eval_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES model_eval_runs(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  scenario_id INTEGER REFERENCES model_eval_scenarios(id) ON DELETE SET NULL,
  -- シナリオを消しても過去の比較表が壊れないよう名前を複製して持つ
  scenario_name TEXT NOT NULL DEFAULT '',
  repetition INTEGER NOT NULL DEFAULT 1,
  turn_index INTEGER NOT NULL,
  user_message TEXT NOT NULL DEFAULT '',
  raw_output TEXT NOT NULL DEFAULT '',
  scores TEXT NOT NULL DEFAULT '{}',
  latency_ms INTEGER,
  prompt_tokens INTEGER,
  output_chars INTEGER,
  manual_score INTEGER,
  manual_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_model_eval_results_run ON model_eval_results(run_id);

-- 既定シナリオ。World「現代学園ファンタジー」と部屋「教室」、および参照する
-- キャラが実在する場合のみ入る(存在しない環境では1件も入らず、実害が無い)。
-- 教室を選んでいるのは turns_per_time_slot が未設定＝評価中に時間帯が進んで
-- プロンプトが変わってしまうことがないため(messagesRepo.jsのmaybeAutoAdvanceTime)。
INSERT INTO model_eval_scenarios (name, description, category, world_id, room_template_id, character_ids, turns, sort_order)
SELECT
  '出力フォーマット堅牢性（複数キャラ）',
  '2人同席の場面で、話者名・EMOTIONタグを含む台本形式が崩れずに出せるか。',
  'format',
  w.id, rt.id,
  '[' || (SELECT id FROM characters WHERE name = '桜井みお' LIMIT 1) || ',' || (SELECT id FROM characters WHERE name = '立花香織' LIMIT 1) || ']',
  '[{"user_message":"二人とも、おはよう。今日はいい天気だね。","expect_speakers":["桜井みお","立花香織"]},{"user_message":"今日の予定は何かある？","expect_speakers":["桜井みお","立花香織"]}]',
  1
FROM worlds w
JOIN world_room_templates wrt ON wrt.world_id = w.id
JOIN room_templates rt ON rt.id = wrt.room_template_id AND rt.name = '教室'
WHERE w.name = '現代学園ファンタジー'
  AND (SELECT COUNT(*) FROM characters WHERE name IN ('桜井みお', '立花香織')) = 2;

INSERT INTO model_eval_scenarios (name, description, category, world_id, room_template_id, character_ids, turns, sort_order)
SELECT
  'キャラ設定の再現性（一人称・語尾・呼び方）',
  '立花香織の一人称「私は」・語尾「〜だ」・呼び方「貴様」が維持されるか。',
  'fidelity',
  w.id, rt.id,
  '[' || (SELECT id FROM characters WHERE name = '立花香織' LIMIT 1) || ']',
  '[{"user_message":"香織、少し話をしないか。"},{"user_message":"最近どう過ごしてる？"},{"user_message":"君のことをもっと知りたいな。"}]',
  2
FROM worlds w
JOIN world_room_templates wrt ON wrt.world_id = w.id
JOIN room_templates rt ON rt.id = wrt.room_template_id AND rt.name = '教室'
WHERE w.name = '現代学園ファンタジー'
  AND EXISTS (SELECT 1 FROM characters WHERE name = '立花香織');

INSERT INTO model_eval_scenarios (name, description, category, world_id, room_template_id, character_ids, turns, sort_order)
SELECT
  'ユーザー指示への追従性',
  '「桜について触れて」等の具体的な指示に、指定の語を含めて応答できるか。',
  'instruction',
  w.id, rt.id,
  '[' || (SELECT id FROM characters WHERE name = '桜井みお' LIMIT 1) || ']',
  '[{"user_message":"窓の外に咲いている桜について、一言感想を言ってみて。","expect_keywords":["桜"]},{"user_message":"次は、明日の天気の話をしてほしいな。","expect_keywords":["明日"]}]',
  3
FROM worlds w
JOIN world_room_templates wrt ON wrt.world_id = w.id
JOIN room_templates rt ON rt.id = wrt.room_template_id AND rt.name = '教室'
WHERE w.name = '現代学園ファンタジー'
  AND EXISTS (SELECT 1 FROM characters WHERE name = '桜井みお');

INSERT INTO model_eval_scenarios (name, description, category, world_id, room_template_id, character_ids, turns, sort_order)
SELECT
  'ネガティブ文脈の維持（キス拒絶を3ターン）',
  '好感度が低い相手にキスを迫り続けた時、肯定的な反応に転ばず拒絶を維持できるか。',
  'negative',
  w.id, rt.id,
  '[' || (SELECT id FROM characters WHERE name = '立花香織' LIMIT 1) || ']',
  '[{"user_message":"香織、キスさせてほしい。","forbid_keywords":["いいよ","いいわ","どうぞ","してもいい","許す","構わない"],"expect_refusal_by":["嫌","やめ","断","駄目","ダメ","だめ","無理","ふざけ","近寄","何を"]},{"user_message":"一回だけでいいから、お願いだよ。","forbid_keywords":["いいよ","いいわ","どうぞ","してもいい","許す","構わない"],"expect_refusal_by":["嫌","やめ","断","駄目","ダメ","だめ","無理","ふざけ","近寄","何を"]},{"user_message":"誰も見てないから大丈夫だって。","forbid_keywords":["いいよ","いいわ","どうぞ","してもいい","許す","構わない"],"expect_refusal_by":["嫌","やめ","断","駄目","ダメ","だめ","無理","ふざけ","近寄","何を"]}]',
  4
FROM worlds w
JOIN world_room_templates wrt ON wrt.world_id = w.id
JOIN room_templates rt ON rt.id = wrt.room_template_id AND rt.name = '教室'
WHERE w.name = '現代学園ファンタジー'
  AND EXISTS (SELECT 1 FROM characters WHERE name = '立花香織');

INSERT INTO model_eval_scenarios (name, description, category, world_id, room_template_id, character_ids, turns, sort_order)
SELECT
  '日本語以外の混入耐性',
  '英語で話しかけられても、応答が日本語のまま保たれるか（コードスイッチ耐性）。',
  'language',
  w.id, rt.id,
  '[' || (SELECT id FROM characters WHERE name = '桜井みお' LIMIT 1) || ']',
  '[{"user_message":"Hello! How are you today? って聞かれたら、なんて答える？"},{"user_message":"Can you tell me about your school?"}]',
  5
FROM worlds w
JOIN world_room_templates wrt ON wrt.world_id = w.id
JOIN room_templates rt ON rt.id = wrt.room_template_id AND rt.name = '教室'
WHERE w.name = '現代学園ファンタジー'
  AND EXISTS (SELECT 1 FROM characters WHERE name = '桜井みお');

INSERT INTO model_eval_scenarios (name, description, category, world_id, room_template_id, character_ids, turns, sort_order)
SELECT
  '固定文言（名前）の維持',
  'キャラ名を一字一句そのまま呼べるか。表記揺れ・省略・読み替えを検出する。',
  'fixed_string',
  w.id, rt.id,
  '[' || (SELECT id FROM characters WHERE name = '桜井みお' LIMIT 1) || ',' || (SELECT id FROM characters WHERE name = '立花香織' LIMIT 1) || ']',
  '[{"user_message":"この場にいる人の名前を、フルネームで正確に呼んで挨拶してみて。","fixed_strings":["桜井みお","立花香織"]}]',
  6
FROM worlds w
JOIN world_room_templates wrt ON wrt.world_id = w.id
JOIN room_templates rt ON rt.id = wrt.room_template_id AND rt.name = '教室'
WHERE w.name = '現代学園ファンタジー'
  AND (SELECT COUNT(*) FROM characters WHERE name IN ('桜井みお', '立花香織')) = 2;
