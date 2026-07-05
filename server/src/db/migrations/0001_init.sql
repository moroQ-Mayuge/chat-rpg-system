-- ChatRPG initial schema (SPEC.md §4 + event_fire_history + playthroughs/calendar additions)

CREATE TABLE worlds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  worldview TEXT NOT NULL DEFAULT '',
  is_unassigned_bucket INTEGER NOT NULL DEFAULT 0,
  time_slot_labels TEXT NOT NULL DEFAULT '["朝","昼","放課後","夜"]',
  weather_options TEXT NOT NULL DEFAULT '["晴れ","曇り","雨"]',
  season_labels TEXT NOT NULL DEFAULT '["春","夏","秋","冬"]',
  days_per_season INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE playthroughs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id),
  name TEXT NOT NULL,
  current_day INTEGER NOT NULL DEFAULT 1,
  current_time_slot_index INTEGER NOT NULL DEFAULT 0,
  current_weather TEXT NOT NULL DEFAULT '',
  current_season_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  full_name_reading TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL DEFAULT '',
  occupation TEXT NOT NULL DEFAULT '',
  age_real TEXT NOT NULL DEFAULT '',
  age_apparent TEXT NOT NULL DEFAULT '',
  race TEXT NOT NULL DEFAULT '',
  attribute TEXT NOT NULL DEFAULT '',
  appearance_features TEXT NOT NULL DEFAULT '',
  eye_description TEXT NOT NULL DEFAULT '',
  hair_description TEXT NOT NULL DEFAULT '',
  body_type TEXT NOT NULL DEFAULT '',
  bust_description TEXT NOT NULL DEFAULT '',
  physical_features TEXT NOT NULL DEFAULT '',
  first_person TEXT NOT NULL DEFAULT '',
  call_user_as TEXT NOT NULL DEFAULT '',
  call_others_as TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL DEFAULT '',
  speech_style TEXT NOT NULL DEFAULT '',
  sentence_ending TEXT NOT NULL DEFAULT '',
  behavior_principle TEXT NOT NULL DEFAULT '',
  social_tendency TEXT NOT NULL DEFAULT '',
  habits TEXT NOT NULL DEFAULT '',
  likes TEXT NOT NULL DEFAULT '',
  dislikes TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  special_skills TEXT NOT NULL DEFAULT '',
  weakness TEXT NOT NULL DEFAULT '',
  secret TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  event_participation_weight REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE room_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id),
  worldview_mode TEXT NOT NULL DEFAULT 'inherit' CHECK (worldview_mode IN ('inherit', 'custom')),
  name TEXT NOT NULL,
  initial_situation TEXT NOT NULL DEFAULT '',
  location_text TEXT NOT NULL DEFAULT '',
  location_tags TEXT,
  atmosphere_text TEXT NOT NULL DEFAULT '',
  atmosphere_tags TEXT,
  worldview TEXT,
  background_image_path TEXT,
  turns_per_time_slot INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE props (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  danbooru_tags TEXT NOT NULL DEFAULT '',
  category TEXT,
  description TEXT
);

CREATE TABLE expression_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  llm_tag_key TEXT NOT NULL UNIQUE
);

CREATE TABLE relationship_axes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  min_value INTEGER NOT NULL DEFAULT 0,
  max_value INTEGER NOT NULL DEFAULT 100,
  default_value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE outfits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  clothing_description TEXT NOT NULL DEFAULT '',
  equipment_description TEXT NOT NULL DEFAULT '',
  image_tags TEXT NOT NULL DEFAULT '',
  standing_image_path TEXT,
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE outfit_expression_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outfit_id INTEGER NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
  expression_type_id INTEGER NOT NULL REFERENCES expression_types(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  UNIQUE (outfit_id, expression_type_id)
);

CREATE TABLE character_relationship_defaults (
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  relationship_axis_id INTEGER NOT NULL REFERENCES relationship_axes(id) ON DELETE CASCADE,
  initial_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, relationship_axis_id)
);

CREATE TABLE room_template_characters (
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  is_default_participant INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (room_template_id, character_id)
);

CREATE TABLE room_template_props (
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  prop_id INTEGER NOT NULL REFERENCES props(id) ON DELETE CASCADE,
  PRIMARY KEY (room_template_id, prop_id)
);

CREATE TABLE room_template_free_props (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  description TEXT NOT NULL
);

CREATE TABLE event_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'room_template')),
  room_template_id INTEGER REFERENCES room_templates(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  condition_logic TEXT NOT NULL DEFAULT 'AND' CHECK (condition_logic IN ('AND', 'OR')),
  priority INTEGER NOT NULL DEFAULT 0,
  cooldown_turns INTEGER NOT NULL DEFAULT 0,
  max_fires_per_session INTEGER,
  exclusive_group TEXT
);

CREATE TABLE event_conditions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL CHECK (
    condition_type IN ('probability', 'turn_count', 'keyword', 'relationship_threshold', 'flag_state', 'participant_count')
  ),
  params TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE event_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (
    action_type IN ('character_join', 'character_leave', 'insert_dialogue', 'generate_image', 'set_flag', 'change_relationship', 'change_outfit', 'advance_time')
  ),
  params TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE room_template_events (
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  override_probability REAL,
  PRIMARY KEY (room_template_id, event_definition_id)
);

CREATE TABLE room_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id),
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id),
  entered_day INTEGER NOT NULL DEFAULT 1,
  entered_time_slot_index INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  current_location_text TEXT NOT NULL DEFAULT '',
  current_location_tags TEXT,
  current_atmosphere_text TEXT NOT NULL DEFAULT '',
  current_atmosphere_tags TEXT,
  current_scene_image_id INTEGER REFERENCES generated_images(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended'))
);

CREATE TABLE generated_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_session_id INTEGER NOT NULL REFERENCES room_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('face', 'scene', 'event')),
  character_id INTEGER REFERENCES characters(id),
  prompt TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE room_session_characters (
  room_session_id INTEGER NOT NULL REFERENCES room_sessions(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  left_at TEXT,
  current_outfit_id INTEGER REFERENCES outfits(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (room_session_id, character_id)
);

-- Scoped to playthrough (not room_session) so affection/trust/etc. persist across
-- every room visited within the same route, per SPEC.md §3.2/§3.6.
CREATE TABLE relationship_states (
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  relationship_axis_id INTEGER NOT NULL REFERENCES relationship_axes(id) ON DELETE CASCADE,
  current_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (playthrough_id, character_id, relationship_axis_id)
);

-- Scoped to playthrough for the same reason as relationship_states.
CREATE TABLE session_flags (
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  flag_key TEXT NOT NULL,
  flag_value TEXT,
  PRIMARY KEY (playthrough_id, flag_key)
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_session_id INTEGER NOT NULL REFERENCES room_sessions(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'character', 'narration', 'system')),
  character_id INTEGER REFERENCES characters(id),
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image')),
  content TEXT,
  image_id INTEGER REFERENCES generated_images(id),
  emotion_tag TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Not in SPEC.md's original table list; added during implementation planning because
-- cooldown_turns / max_fires_per_session / turn_count's "last_fire_of_this_event"
-- reference all require querying an event's past-fire history. Scoped to playthrough
-- (not room_session) for the same cross-room persistence reason as relationship_states.
CREATE TABLE event_fire_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  fired_at_turn INTEGER NOT NULL,
  fired_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_session ON messages(room_session_id, created_at);
CREATE INDEX idx_room_sessions_playthrough ON room_sessions(playthrough_id, status);
CREATE INDEX idx_room_sessions_template ON room_sessions(room_template_id, updated_at);
CREATE INDEX idx_event_fire_history_lookup ON event_fire_history(playthrough_id, event_definition_id, fired_at_turn);
CREATE INDEX idx_playthroughs_world ON playthroughs(world_id, updated_at);

-- Seed data

INSERT INTO worlds (name, worldview, is_unassigned_bucket) VALUES ('未所属', '', 1);

INSERT INTO expression_types (name, llm_tag_key) VALUES
  ('通常', 'normal'),
  ('笑顔', 'smile'),
  ('怒り', 'angry'),
  ('悲しみ', 'sad'),
  ('驚き', 'surprised'),
  ('照れ', 'blush'),
  ('困り', 'troubled'),
  ('喘ぎ', 'moan');

INSERT INTO relationship_axes (name, min_value, max_value, default_value) VALUES
  ('好感度', 0, 100, 0),
  ('信頼度', 0, 100, 0),
  ('恋愛度', 0, 100, 0),
  ('欲情度', 0, 100, 0),
  ('依存度', 0, 100, 0),
  ('淫乱度', 0, 100, 0);
