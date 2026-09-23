-- 部屋プロファイル機構。room_templateごとに複数の「出現キャラ(属性キー)＋
-- 雰囲気/場所」セットを持てるようにし、日替わりランダム抽選(selection_mode=
-- 'random')またはイベントからの強制指定(='manual'、set_room_profileアクション
-- 経由でのみ有効化)で切り替える。空文字のattribute_tags/atmosphere_text/
-- location_textは「上書きしない」を意味する(既存の部屋タグ→Worldタグ空文字
-- フォールバック規約と同じ)。

CREATE TABLE room_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  attribute_tags TEXT NOT NULL DEFAULT '',
  atmosphere_text TEXT NOT NULL DEFAULT '',
  location_text TEXT NOT NULL DEFAULT '',
  selection_mode TEXT NOT NULL DEFAULT 'random' CHECK (selection_mode IN ('random', 'manual')),
  weight INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_room_profiles_room ON room_profiles(room_template_id);

-- playthrough×room_templateごとの「現在有効なプロファイル」。auto_*は日替わり
-- 抽選のキャッシュ(playthrough_shop_lineupsのgenerated_at_dayと同じ遅延解決
-- パターン)、override_profile_idはイベントによる強制上書き(最優先、クリアする
-- まで居座る)。使用済みプリセットが削除できなくなる不具合(2026-09-23、mob名前/
-- 苗字/ペルソナで発生・修正済み)の再発防止で、参照列は最初からON DELETE SET NULL。
CREATE TABLE playthrough_room_active_profile (
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  auto_profile_id INTEGER REFERENCES room_profiles(id) ON DELETE SET NULL,
  auto_generated_at_day INTEGER,
  override_profile_id INTEGER REFERENCES room_profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (playthrough_id, room_template_id)
);

-- event_actions.action_typeのCHECK制約にset_room_profile/clear_room_profileを
-- 追加。SQLiteはCHECK制約をALTERできないため、0136と同じテーブル再構築手順
-- (event_actions(id)を参照する他テーブルは無いため安全)。
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
      'set_pose', 'transform_character', 'end_session', 'set_accompanying', 'promote_mob_to_favorite',
      'set_room_profile', 'clear_room_profile'
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
