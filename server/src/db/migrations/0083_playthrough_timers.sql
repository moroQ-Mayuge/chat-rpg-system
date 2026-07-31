-- 汎用タイマー(予約)。「n日経ってから何かが起きる」という形をした出来事を
-- まとめて扱うための土台。
--
-- 揺り籠(出産から一定日数で子が戻る)は専用の仕組みとして作ったが、手紙が届く・
-- 注文品の入荷・怪我の治癒・約束の日といった話は全部これと同じ形をしている。
-- 個別に機能を足していくのではなく、作者がイベントから予約を張れる道具を1つ置く。
--
-- 妊娠・成育の導出(0076/0080)はそのまま残す。あちらは専用の段階名とプロンプト行を
-- 持っているので、置き換えではなく並列に置く道具という位置づけ。
CREATE TABLE playthrough_timers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  timer_key TEXT NOT NULL,
  -- キャラに紐づくタイマー(「この子が戻る」)はキャラフラグへ、紐づかないもの
  -- (「店の改装が終わる」)はセッションフラグへ写す。NULL=ルート全体。
  character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
  start_day INTEGER NOT NULL,
  due_day INTEGER NOT NULL,
  -- 作者が後から見て何のタイマーか分かるようにするだけのもの。判定には使わない。
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 同じルート・同じキー・同じ対象のタイマーは1本だけ。張り直したら期日が更新される
-- (「約束を来週に延ばす」が自然に書ける)。character_id が NULL の行も1本に
-- まとめたいので、UNIQUE ではなく COALESCE を噛ませた部分インデックスにする
-- ——SQLiteの UNIQUE は NULL 同士を別物として扱うため。
CREATE UNIQUE INDEX idx_playthrough_timers_key
  ON playthrough_timers(playthrough_id, timer_key, COALESCE(character_id, 0));

-- 新アクション set_timer / clear_timer を許可する。SQLiteはCHECK制約を
-- ALTERできないため、0077等と同じくテーブルを作り直す。
CREATE TABLE event_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'character_join', 'character_leave', 'insert_dialogue', 'generate_image', 'set_flag',
      'change_relationship', 'change_outfit', 'advance_time', 'grant_item', 'remove_item',
      'change_status', 'set_address', 'spend_money', 'set_scene_situation', 'grant_random_item',
      'set_character_impression', 'add_character_memory', 'make_item_available',
      'conceive', 'end_pregnancy', 'set_timer', 'clear_timer'
    )
  ),
  params TEXT NOT NULL DEFAULT '{}',
  outcome TEXT NOT NULL DEFAULT 'always' CHECK (outcome IN ('always', 'success', 'failure')),
  outcome_node_id INTEGER REFERENCES event_outcome_nodes(id) ON DELETE CASCADE
);
INSERT INTO event_actions_new (id, event_definition_id, action_type, params, outcome, outcome_node_id)
  SELECT id, event_definition_id, action_type, params, outcome, outcome_node_id FROM event_actions;
DROP TABLE event_actions;
ALTER TABLE event_actions_new RENAME TO event_actions;
