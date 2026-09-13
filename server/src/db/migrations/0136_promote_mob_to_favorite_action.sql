-- モブの「プール」導線を、同行+部屋移動(promoteAccompanyingFlavoredMobs)以外にも
-- 増やすための汎用アクション。promoteMobToFavorite()自体は既存関数の再利用で、
-- 新しい判定ロジックは持たない薄いラッパー。

CREATE TABLE event_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'character_join', 'character_leave', 'insert_dialogue', 'generate_image', 'set_flag',
      'change_relationship', 'change_outfit', 'advance_time', 'grant_item', 'remove_item',
      'change_status', 'set_address', 'spend_money', 'set_scene_situation', 'grant_random_item',
      'set_character_impression', 'add_character_memory', 'make_item_available',
      'conceive', 'end_pregnancy', 'set_timer', 'clear_timer', 'time_skip', 'force_room_transfer',
      'set_pose', 'transform_character', 'end_session', 'set_accompanying', 'promote_mob_to_favorite'
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

-- 「連絡先を交換する」イベントのアクションをset_flagからpromote_mob_to_favorite
-- へ置き換える。モブ同士は同じ共有character_idを複数セッション/複数ペルソナで
-- 使い回すため(mob_character_concept.md)、character_idへ直接playthrough
-- スコープでフラグを立てると「今日出会ったこの個体」ではなく「今後何度でも
-- 出てくる共有テンプレートそのもの」が永久に連絡先交換済み扱いになってしまう。
-- 交換の瞬間にこの個体を実体化(プール)してから、その安定した新character_idへ
-- フラグを立てるようにする。
UPDATE event_actions
SET action_type = 'promote_mob_to_favorite',
    params = '{"character_id":"mentioned","allow_without_preset":true,"grant_flag_key":"contact_exchanged","grant_flag_value":"1","grant_flag_scope":"playthrough"}'
WHERE action_type = 'set_flag'
  AND event_definition_id = (SELECT id FROM event_definitions WHERE name = '連絡先を交換する');

-- 新規イベント：関係値のしきい値到達で自動プール(ユーザー要望による追加導線)。
-- per_character_firing+reset_scope='session'で、この個体・このセッション限りの
-- 判定として扱う(同じ共有character_idの別セッション/別ペルソナに影響させない)。
INSERT INTO event_definitions (name, scope, condition_logic, per_character_firing, reset_scope, max_fires_per_session, has_outcome_branch)
VALUES ('関係値のしきい値到達で自動プール', 'global', 'OR', 1, 'session', 1, 0);

INSERT INTO event_conditions (event_definition_id, condition_type, params, phase)
SELECT id, 'relationship_threshold', '{"character_id":"any_present","axis_id":2,"comparison":">=","value":50}', 'trigger'
FROM event_definitions WHERE name = '関係値のしきい値到達で自動プール';
INSERT INTO event_conditions (event_definition_id, condition_type, params, phase)
SELECT id, 'relationship_threshold', '{"character_id":"any_present","axis_id":3,"comparison":">=","value":50}', 'trigger'
FROM event_definitions WHERE name = '関係値のしきい値到達で自動プール';
INSERT INTO event_conditions (event_definition_id, condition_type, params, phase)
SELECT id, 'relationship_threshold', '{"character_id":"any_present","axis_id":5,"comparison":">=","value":50}', 'trigger'
FROM event_definitions WHERE name = '関係値のしきい値到達で自動プール';

INSERT INTO event_actions (event_definition_id, action_type, params, outcome)
SELECT id, 'promote_mob_to_favorite', '{"character_id":"condition_matched","allow_without_preset":true}', 'always'
FROM event_definitions WHERE name = '関係値のしきい値到達で自動プール';
