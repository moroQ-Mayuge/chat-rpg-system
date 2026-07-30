-- ユーザーの指示が世界観・状況から外れたときどう扱うかのWorld設定。
--
-- 発端は「主人公=あなたが無自覚な世界改変能力を持つ」という設定を足したいと
-- いう要望で、LLM主体のゲームで無茶な指定が通ってしまうことの世界観的な
-- 裏付けを兼ねる。ただし能力の説明だけをプロンプトに載せると、LLMはそれを
-- 許可と読んで今より無茶を通すようになる——だから warp_lore と下の制限は
-- 必ず同じブロックで出す(promptBuilder.js の buildWarpConstraintBlock)。

-- 軸1 改変対象。既定は全部1で、その場合プロンプトに1行も足さない
-- (=既存Worldの挙動は完全に不変)。チェックを外した対象についてだけ
-- 「これは変えられない」という行が増える。
ALTER TABLE worlds ADD COLUMN warp_world_rules INTEGER NOT NULL DEFAULT 1;
ALTER TABLE worlds ADD COLUMN warp_situation INTEGER NOT NULL DEFAULT 1;
-- 他者の心。ここを外すのがゲームとして一番効く——関係構築が唯一の攻略対象
-- なので、「好感度が100になる」が指示で通ると成立しなくなる。プロンプト文
-- だけでは守れないため、機構側の担保は worlds.llm_value_delta_cap(0075)。
ALTER TABLE worlds ADD COLUMN warp_others_mind INTEGER NOT NULL DEFAULT 1;

-- 軸2 逸脱時の扱い。列だけ用意し、既定の accept ではプロンプトに何も足さない。
-- reinterpret/push_back の文面は、実際に使うWorldが出来てから詰める
-- (今書いても検証する対象が無い)。
ALTER TABLE worlds ADD COLUMN deviation_handling TEXT NOT NULL DEFAULT 'accept'
  CHECK (deviation_handling IN ('accept', 'reinterpret', 'push_back'));

-- 軸3 方針の提示。ルート開始時に一度だけ表示する宣言文で、LLMは一切使わない。
-- 毎ターン逸脱を判定するとローカル実行では待ち時間が倍になるため、
-- 「機構では止めないが作者の意図は伝える」という位置づけにしてある。
ALTER TABLE worlds ADD COLUMN policy_notice TEXT NOT NULL DEFAULT '';

-- 改変能力そのものの設定文(フィクション側)。空なら見出しごと出さない。
ALTER TABLE worlds ADD COLUMN warp_lore TEXT NOT NULL DEFAULT '';
