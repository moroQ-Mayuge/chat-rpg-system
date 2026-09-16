-- 「靴下」表記だと、同じclothing_legs列に「パンスト」を定義しているキャラ
-- (早坂ここな等、0140完了直後に洗い出し済み)に対して名称が実態と合わなく
-- なるため、outfit tag category自体の呼称と同じ「足回り」に統一する。
-- 0140で作った靴下系character_statuses/action_commands/event_definitions/
-- event_conditionsのみが対象(靴/shoes側は「靴」のままで問題ないため対象外)。

UPDATE character_statuses SET name = REPLACE(name, '靴下', '足回り') WHERE exclusive_group LIKE 'undress_state_lower_socks%';

UPDATE action_commands SET label = REPLACE(label, '靴下', '足回り'), keyword_text = REPLACE(keyword_text, '靴下', '足回り')
WHERE disturbance_target_field = 'clothing_legs';

UPDATE event_conditions SET params = REPLACE(params, '靴下', '足回り')
WHERE event_definition_id IN (SELECT id FROM event_definitions WHERE name LIKE '行動:靴下%（下半身）');

UPDATE event_definitions SET name = REPLACE(name, '靴下', '足回り') WHERE name LIKE '行動:靴下%（下半身）';
