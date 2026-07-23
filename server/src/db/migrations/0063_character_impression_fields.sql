-- Freeform key-based "relationship/impression" fields for characters
-- (chat_feature_enhancement_backlog L2): unlike relationship_axes (numeric,
-- fixed catalog shared across all characters), these are user-named text
-- fields per character (e.g. "あなたとの関係", "あなたの印象") that persist
-- for a whole playthrough and can be rewritten by events or an optional LLM
-- auto-update at session transition, so a character's situational narrative
-- state (e.g. "初キスしたばかりで顔を見るのが恥ずかしい") doesn't silently
-- reset just because the room session ended.
CREATE TABLE character_impression_defaults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  default_value TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_character_impression_defaults_character ON character_impression_defaults(character_id);

-- Current value, seeded from character_impression_defaults on first
-- encounter (ensureImpressionStatesSeeded in characterImpressionStatesRepo.js,
-- hooked at the same 3 call sites as ensureRelationshipStatesSeeded). Scope
-- columns mirror character_address_states exactly (0026/0041/0045): non-mob
-- characters key on playthrough_id alone -- persisting across every room
-- session in that playthrough is the whole point of this feature, unlike a
-- mob's session-scoped state, which intentionally resets. Mob characters
-- still key on room_session_id/room_session_character_id instead, matching
-- every other per-mob-instance state in this app.
CREATE TABLE character_impression_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  playthrough_id INTEGER REFERENCES playthroughs(id) ON DELETE CASCADE,
  room_session_id INTEGER REFERENCES room_sessions(id) ON DELETE CASCADE,
  room_session_character_id INTEGER REFERENCES room_session_characters(id) ON DELETE CASCADE,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_character_impression_states_lookup
  ON character_impression_states(character_id, field_key, playthrough_id, room_session_id, room_session_character_id);

-- World-level opt-in (default off) for the LLM auto-update at session
-- transition (impressionAutoUpdate.js) -- same "opt-in, default off" design
-- as relationship_update_interval_turns, confirmed with the user.
ALTER TABLE worlds ADD COLUMN impression_auto_update_enabled INTEGER NOT NULL DEFAULT 0;

-- New event action set_character_impression, mirroring set_address's
-- targeting. SQLite can't ALTER a CHECK constraint, so this rebuilds
-- event_actions the same way 0026/0050/0057/etc. did.
CREATE TABLE event_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN (
      'character_join', 'character_leave', 'insert_dialogue', 'generate_image', 'set_flag',
      'change_relationship', 'change_outfit', 'advance_time', 'grant_item', 'remove_item',
      'change_status', 'set_address', 'spend_money', 'set_scene_situation', 'grant_random_item',
      'set_character_impression'
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
