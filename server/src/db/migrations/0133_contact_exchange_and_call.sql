-- 連絡先の交換＆呼び出し機能。新しいcondition_type/action_typeは一切追加せず、
-- 既存のイベントエンジンのプリミティブ（keyword/flag_state/relationship_probability
-- 条件、set_flag/character_join アクション）だけで組み立てる。Worldごとの
-- 呼び出し方法の違いは worlds.call_method_lore のプロンプト注入だけが担うため、
-- イベント自体は scope='global' で1組用意すれば全Worldで共通して動く
-- （0126の「同行を頼む/やめさせる」と同じ構成）。

-- World毎に1方式の呼び出し方法を自由記述できる設定（warp_loreと同型）。
-- 既定OFF・空文字＝既存Worldの挙動に影響なし。
ALTER TABLE worlds ADD COLUMN call_method_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE worlds ADD COLUMN call_method_lore TEXT NOT NULL DEFAULT '';

-- 会話コマンド2つ（共通、0126と同じ書き方）。
INSERT INTO action_commands (world_id, label, icon, command_type, keyword_text, sort_order, category, subcategory)
VALUES
  (NULL, '連絡先を交換する', '🤝', 'keyword', '連絡先を交換して', 1, '連絡先', ''),
  (NULL, '呼び出す', '📞', 'keyword', '呼び出して', 2, '連絡先', '');

-- イベント1: 連絡先交換。頼めば必ず成立する（成否判定なし）。
INSERT INTO event_definitions (name, scope, condition_logic, has_outcome_branch, outcome_success_hint_text, outcome_failure_hint_text)
VALUES ('連絡先を交換する', 'global', 'AND', 0, '', '');

INSERT INTO event_conditions (event_definition_id, condition_type, params, phase)
SELECT id, 'keyword', '{"keywords":["連絡先を交換して"],"match_mode":"any","target":"user_message"}', 'trigger'
FROM event_definitions WHERE name = '連絡先を交換する';

INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT id, 'set_flag', '{"character_id":"mentioned","flag_key":"contact_exchanged","operation":"set","value":"1","scope":"playthrough"}', 'always'
FROM event_definitions WHERE name = '連絡先を交換する';

-- イベント2: 呼び出す。連絡先交換済みが前提(flag_state)、成否は関係値確率
-- (信頼度/恋愛度/依存度のどれか高い方、同行コマンドと同じ軸group)。
INSERT INTO event_definitions (name, scope, condition_logic, has_outcome_branch, outcome_success_hint_text, outcome_failure_hint_text)
VALUES (
  '呼び出す',
  'global',
  'AND',
  1,
  '呼び出しに応じてこちらに向かっている（まもなく合流する）',
  '今は都合が悪いようで、呼び出しには応じられないと伝えてきた（実際には来ない）'
);

INSERT INTO event_conditions (event_definition_id, condition_type, params, phase)
SELECT id, 'keyword', '{"keywords":["呼び出して"],"match_mode":"any","target":"user_message"}', 'trigger'
FROM event_definitions WHERE name = '呼び出す';

INSERT INTO event_conditions (event_definition_id, condition_type, params, phase)
SELECT id, 'flag_state', '{"character_id":"mentioned","flag_key":"contact_exchanged","comparison":"==","value":"1","scope":"playthrough"}', 'trigger'
FROM event_definitions WHERE name = '呼び出す';

INSERT INTO event_conditions (event_definition_id, condition_type, params, phase)
SELECT id, 'relationship_probability', '{"character_id":"mentioned","axis_ids":[2,3,5]}', 'outcome'
FROM event_definitions WHERE name = '呼び出す';

INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT id, 'character_join', '{"selection_mode":"specific","character_id":"mentioned","require_attribute_match":false}', 'success'
FROM event_definitions WHERE name = '呼び出す';
