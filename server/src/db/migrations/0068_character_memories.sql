-- 追記型の「記憶」レイヤー。character_impression_states(0063)が「今どういう
-- 心情か」の1フィールド1値スナップショット(セッション遷移のたびに丸ごと
-- 上書き)なのに対し、こちらは「いつ何があったか」を追記で貯める。上書き
-- されないので、重要な出来事がセッションを何度またいでも残る。
--
-- 所有者はキャラ本体ではなくルート(playthrough)。characters行は複数World・
-- 複数ルートで共有されるマスタなので、「このルートでの出来事」はルート側に
-- ぶら下げる(character_impression_statesが非モブでplaythrough_idだけを鍵に
-- しているのと同じ考え方)。
--
-- モブキャラ(characters.is_mob)には記憶を作らない。モブは設計上セッション
-- ごとに関係値・呼び方・自己ステータスがリセットされる使い捨ての存在で、
-- ルート永続の記憶を持つのと矛盾するため(書き込み3経路すべてでガード)。
CREATE TABLE character_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  -- ピン留め: プロンプト注入時にmemory_prompt_limitの件数枠外で必ず載る。
  is_pinned INTEGER NOT NULL DEFAULT 0,
  -- 書き込み時点の作中日時を文字列で固定保存(例「2日目 朝」)。あとから
  -- playthroughs.current_dayを見ても"今"しか分からないため、記録時点の
  -- スナップショットが必要。プロンプト上で「いつの出来事か」を示す。
  occurred_label TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'event', 'auto')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_character_memories_lookup
  ON character_memories(playthrough_id, character_id, is_pinned, id);

-- プロンプトに載せる未ピン記憶の件数上限(ローカルLLMのコンテキスト対策)。
-- 0なら記憶を一切載せない(機能OFF相当)。
ALTER TABLE worlds ADD COLUMN memory_prompt_limit INTEGER NOT NULL DEFAULT 5;
-- セッション終了時のLLM自動抽出。impression_auto_update_enabledと同じ
-- 「World単位opt-in、既定OFF」(LLM呼び出しが1回増えるため)。
ALTER TABLE worlds ADD COLUMN memory_auto_extract_enabled INTEGER NOT NULL DEFAULT 0;
-- 記憶の手動編集UI(PlaythroughsPageの記憶パネル)を出すかどうか。制作中は
-- ONで編集し、遊ぶユーザーに配る段階でOFFにする想定なので既定はON。
ALTER TABLE worlds ADD COLUMN memory_editing_visible INTEGER NOT NULL DEFAULT 1;

-- 新アクションadd_character_memoryを許可する。SQLiteはCHECK制約を
-- ALTERできないため、0063等と同じくテーブルを作り直す。
CREATE TABLE event_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'character_join', 'character_leave', 'insert_dialogue', 'generate_image', 'set_flag',
      'change_relationship', 'change_outfit', 'advance_time', 'grant_item', 'remove_item',
      'change_status', 'set_address', 'spend_money', 'set_scene_situation', 'grant_random_item',
      'set_character_impression', 'add_character_memory'
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
