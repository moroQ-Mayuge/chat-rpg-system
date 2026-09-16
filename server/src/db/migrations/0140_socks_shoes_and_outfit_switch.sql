-- 靴下(足回り=clothing_legs)/靴(shoes)の脱衣トラック追加。靴下は既存の
-- アウター/ベース/下着と同じ4段階(通常/ずり下げる/破る/脱がす)、靴はスタイル
-- 無しの2段階(通常/脱がす)のみ。いずれも下半身分類。

INSERT INTO character_statuses (world_id, name, persistence_scope, removes_from_session, exclusive_group, disturbs_outfit_field, disturbance_style, disturbs_torn, suppresses_outfit_fields)
VALUES
  (NULL, '靴下：通常', 'session', 0, 'undress_state_lower_socks', '', '', 0, ''),
  (NULL, '靴下をずり下げる', 'session', 0, 'undress_state_lower_socks', 'clothing_legs', 'pull', 0, ''),
  (NULL, '靴下を破る', 'session', 0, 'undress_state_lower_socks_torn', 'clothing_legs', '', 1, ''),
  (NULL, '靴下を脱がす', 'session', 0, 'undress_state_lower_socks', '', '', 0, 'clothing_legs'),
  (NULL, '靴：通常', 'session', 0, 'undress_state_lower_shoes', '', '', 0, ''),
  (NULL, '靴を脱がす', 'session', 0, 'undress_state_lower_shoes', '', '', 0, 'shoes');

INSERT INTO action_commands (world_id, label, icon, command_type, keyword_text, sort_order, category, subcategory, disturbance_target_field, disturbance_target_style)
VALUES
  (NULL, '靴下をずり下げる（下半身）', '🫲', 'keyword', '靴下をずり下げる（下半身）', 236, '脱衣', '下半身', 'clothing_legs', 'pull'),
  (NULL, '靴下を破る（下半身）', '🫲', 'keyword', '靴下を破る（下半身）', 237, '脱衣', '下半身', 'clothing_legs', 'torn'),
  (NULL, '靴下を脱がす（下半身）', '🫲', 'keyword', '靴下を脱がす（下半身）', 238, '脱衣', '下半身', 'clothing_legs', 'complete'),
  (NULL, '靴を脱がす（下半身）', '🫲', 'keyword', '靴を脱がす（下半身）', 239, '脱衣', '下半身', 'shoes', 'complete');

INSERT INTO event_definitions (name, scope, condition_logic, has_outcome_branch)
VALUES ('行動:靴下をずり下げる（下半身）', 'global', 'AND', 0);
INSERT INTO event_conditions (event_definition_id, condition_type, params, phase)
SELECT id, 'keyword', '{"keywords":["靴下をずり下げる（下半身）"],"match_mode":"any","target":"user_message","case_sensitive":false}', 'trigger'
FROM event_definitions WHERE name = '行動:靴下をずり下げる（下半身）';
INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT ed.id, 'change_status', json_object('character_id', 'mentioned', 'status_id', cs.id, 'operation', 'grant'), 'always'
FROM event_definitions ed, character_statuses cs
WHERE ed.name = '行動:靴下をずり下げる（下半身）' AND cs.name = '靴下をずり下げる' AND cs.exclusive_group = 'undress_state_lower_socks';

INSERT INTO event_definitions (name, scope, condition_logic, has_outcome_branch)
VALUES ('行動:靴下を破る（下半身）', 'global', 'AND', 0);
INSERT INTO event_conditions (event_definition_id, condition_type, params, phase)
SELECT id, 'keyword', '{"keywords":["靴下を破る（下半身）"],"match_mode":"any","target":"user_message","case_sensitive":false}', 'trigger'
FROM event_definitions WHERE name = '行動:靴下を破る（下半身）';
INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT ed.id, 'change_status', json_object('character_id', 'mentioned', 'status_id', cs.id, 'operation', 'grant'), 'always'
FROM event_definitions ed, character_statuses cs
WHERE ed.name = '行動:靴下を破る（下半身）' AND cs.name = '靴下を破る' AND cs.exclusive_group = 'undress_state_lower_socks_torn';

INSERT INTO event_definitions (name, scope, condition_logic, has_outcome_branch)
VALUES ('行動:靴下を脱がす（下半身）', 'global', 'AND', 0);
INSERT INTO event_conditions (event_definition_id, condition_type, params, phase)
SELECT id, 'keyword', '{"keywords":["靴下を脱がす（下半身）"],"match_mode":"any","target":"user_message","case_sensitive":false}', 'trigger'
FROM event_definitions WHERE name = '行動:靴下を脱がす（下半身）';
INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT ed.id, 'change_status', json_object('character_id', 'mentioned', 'status_id', cs.id, 'operation', 'grant'), 'always'
FROM event_definitions ed, character_statuses cs
WHERE ed.name = '行動:靴下を脱がす（下半身）' AND cs.name = '靴下を脱がす' AND cs.exclusive_group = 'undress_state_lower_socks';

INSERT INTO event_definitions (name, scope, condition_logic, has_outcome_branch)
VALUES ('行動:靴を脱がす（下半身）', 'global', 'AND', 0);
INSERT INTO event_conditions (event_definition_id, condition_type, params, phase)
SELECT id, 'keyword', '{"keywords":["靴を脱がす（下半身）"],"match_mode":"any","target":"user_message","case_sensitive":false}', 'trigger'
FROM event_definitions WHERE name = '行動:靴を脱がす（下半身）';
INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT ed.id, 'change_status', json_object('character_id', 'mentioned', 'status_id', cs.id, 'operation', 'grant'), 'always'
FROM event_definitions ed, character_statuses cs
WHERE ed.name = '行動:靴を脱がす（下半身）' AND cs.name = '靴を脱がす' AND cs.exclusive_group = 'undress_state_lower_shoes';

-- 既存の「全部脱がす（下半身）」ショートカットにも靴下・靴を含める。
INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT ed.id, 'change_status', json_object('character_id', 'mentioned', 'status_id', cs.id, 'operation', 'grant'), 'always'
FROM event_definitions ed, character_statuses cs
WHERE ed.name = '行動:全部脱がす（下半身）' AND cs.name = '靴下を脱がす' AND cs.exclusive_group = 'undress_state_lower_socks';
INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT ed.id, 'change_status', json_object('character_id', 'mentioned', 'status_id', cs.id, 'operation', 'grant'), 'always'
FROM event_definitions ed, character_statuses cs
WHERE ed.name = '行動:全部脱がす（下半身）' AND cs.name = '靴を脱がす' AND cs.exclusive_group = 'undress_state_lower_shoes';
