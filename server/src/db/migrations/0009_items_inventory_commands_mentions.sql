-- Items/inventory (SPEC.md chat enhancement backlog item 3): a common item
-- master plus optional per-World additions, mirroring the existing Prop
-- library's shared-library pattern. world_id IS NULL = common/shared across
-- all Worlds; a set value scopes the item to that World only, so e.g. a
-- modern-day setting never sees a fantasy World's "magic" items.
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_tags TEXT NOT NULL DEFAULT ''
);

-- Playthrough-scoped (not room-session-scoped) so held items persist across
-- every room visited within the same route, same rationale as
-- relationship_states/session_flags (SPEC.md 3.2). owner_character_id is
-- nullable with NULL meaning "the player" — the only holder used today, but
-- left open for a future NPC-inventory extension without a schema change.
CREATE TABLE playthrough_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playthrough_id INTEGER NOT NULL REFERENCES playthroughs(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  owner_character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Quick-tap action commands shown above the chat input (icon or label),
-- same common+per-World tiering as items. 'keyword' commands submit
-- keyword_text as if the player had typed it (an easy way to fire
-- keyword-condition events without free-typing exact phrasing); the other
-- types drive the item UI directly.
CREATE TABLE action_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  command_type TEXT NOT NULL CHECK (command_type IN ('keyword', 'item_pickup', 'item_check', 'item_use', 'free_text')),
  keyword_text TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Explicit @mention target(s) for a user message (chat enhancement backlog
-- item 3c) — resolved server-side from "@name" tokens against the session's
-- current participants at insert time. JSON array of character_id, nullable
-- (most messages mention no one explicitly).
ALTER TABLE messages ADD COLUMN mentioned_character_ids TEXT;

-- Rebuild event_conditions to add 'has_item' as a condition_type (SQLite
-- requires a full table rebuild to change a CHECK constraint). No other
-- table references event_conditions as a parent, so this is a plain
-- copy-drop-rename with no cascading FK concerns.
CREATE TABLE event_conditions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_definition_id INTEGER NOT NULL REFERENCES event_definitions(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL CHECK (
    condition_type IN ('probability', 'turn_count', 'keyword', 'relationship_threshold', 'flag_state', 'participant_count', 'has_item')
  ),
  params TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO event_conditions_new (id, event_definition_id, condition_type, params)
  SELECT id, event_definition_id, condition_type, params FROM event_conditions;
DROP TABLE event_conditions;
ALTER TABLE event_conditions_new RENAME TO event_conditions;
