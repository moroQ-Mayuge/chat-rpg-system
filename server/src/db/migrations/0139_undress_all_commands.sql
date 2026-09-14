-- 上半身/下半身を一括で全部脱がすコマンド。既存の単体「脱がす」系コマンド
-- (id=41等)と同じ書式。disturbance_target_fieldはあえて空文字のままにする
-- ——client/src/pages/ChatPage.jsxのisDisturbanceCommandVisibleは、この列が
-- 空なら可視性カスケード判定(アウターが残っている間はベース操作を隠す等)を
-- 素通りして常時表示する設計になっており、「今どのレイヤーが残っていても
-- 丸ごと最終状態へ一気に進めるショートカット」という性質に合っている。

INSERT INTO action_commands (world_id, label, icon, command_type, keyword_text, sort_order, category, subcategory)
VALUES
  (NULL, '全部脱がす（上半身）', '🫲', 'keyword', '全部脱がす（上半身）', 100, '脱衣', '上半身'),
  (NULL, '全部脱がす（下半身）', '🫲', 'keyword', '全部脱がす（下半身）', 100, '脱衣', '下半身');

INSERT INTO event_definitions (name, scope, condition_logic, has_outcome_branch)
VALUES ('行動:全部脱がす（上半身）', 'global', 'AND', 0);
INSERT INTO event_conditions (event_definition_id, condition_type, params, phase)
SELECT id, 'keyword', '{"keywords":["全部脱がす（上半身）"],"match_mode":"any","target":"user_message","case_sensitive":false}', 'trigger'
FROM event_definitions WHERE name = '行動:全部脱がす（上半身）';
INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT id, 'change_status', '{"character_id":"mentioned","status_id":89,"operation":"grant"}', 'always'
FROM event_definitions WHERE name = '行動:全部脱がす（上半身）';
INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT id, 'change_status', '{"character_id":"mentioned","status_id":96,"operation":"grant"}', 'always'
FROM event_definitions WHERE name = '行動:全部脱がす（上半身）';
INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT id, 'change_status', '{"character_id":"mentioned","status_id":103,"operation":"grant"}', 'always'
FROM event_definitions WHERE name = '行動:全部脱がす（上半身）';

INSERT INTO event_definitions (name, scope, condition_logic, has_outcome_branch)
VALUES ('行動:全部脱がす（下半身）', 'global', 'AND', 0);
INSERT INTO event_conditions (event_definition_id, condition_type, params, phase)
SELECT id, 'keyword', '{"keywords":["全部脱がす（下半身）"],"match_mode":"any","target":"user_message","case_sensitive":false}', 'trigger'
FROM event_definitions WHERE name = '行動:全部脱がす（下半身）';
INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT id, 'change_status', '{"character_id":"mentioned","status_id":110,"operation":"grant"}', 'always'
FROM event_definitions WHERE name = '行動:全部脱がす（下半身）';
INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT id, 'change_status', '{"character_id":"mentioned","status_id":117,"operation":"grant"}', 'always'
FROM event_definitions WHERE name = '行動:全部脱がす（下半身）';
INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT id, 'change_status', '{"character_id":"mentioned","status_id":124,"operation":"grant"}', 'always'
FROM event_definitions WHERE name = '行動:全部脱がす（下半身）';
