-- Rooms become shared master data instead of 1-room-1-World: this migration
-- is purely additive (new tables + backfill), so it can be applied and
-- spot-checked before any application code depends on the new tables. The
-- old world_id-based tables/columns are dropped later, once app code has
-- been cut over and verified against a real playthrough (see the
-- 0032_room_world_decoupling_cleanup.sql that follows in a later commit).

-- Which Worlds use which room (many-to-many). Replaces room_templates.world_id
-- for "which Worlds can this room be entered in" purposes.
CREATE TABLE world_room_templates (
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (world_id, room_template_id)
);
CREATE INDEX idx_world_room_templates_room ON world_room_templates(room_template_id);

-- room_connections (経路) becomes per-World: the same room pair can be wired
-- differently, or not at all, in different Worlds. room_connections never had
-- a world_id column at all (see 0018_room_movement.sql) -- only the admin UI
-- conventionally kept both endpoints in one World.
ALTER TABLE room_connections ADD COLUMN world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE;
CREATE INDEX idx_room_connections_world ON room_connections(world_id);

-- Room-master level: an abstract "slot" a room declares (e.g. "先輩ポジション"),
-- matched by attribute key -- same comma-separated-TEXT + parseAttributeTags/
-- tagsOverlap convention already used by characters/worlds/room_templates.attribute_tags
-- (see attributeTagMatching.js), not a new tagging mechanism.
CREATE TABLE room_template_participant_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  attribute_tags TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_room_slots_room ON room_template_participant_slots(room_template_id);

-- World level: which concrete character fills a given room's slot, for this
-- World's instance of that room. A slot can be unfilled in a given World
-- (simply no row here) -- not an error state.
CREATE TABLE world_room_slot_assignments (
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL REFERENCES room_template_participant_slots(id) ON DELETE CASCADE,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  PRIMARY KEY (world_id, slot_id)
);

-- Props get their own independent common+World-specific category system,
-- same 2-tier pattern as item_categories (0021_item_categories.sql) but a
-- separate table -- not a merge with item categories.
CREATE TABLE prop_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);
ALTER TABLE props ADD COLUMN category_id INTEGER REFERENCES prop_categories(id);

-- Room-master level: broad candidate prop CATEGORIES (not specific instances).
CREATE TABLE room_template_prop_categories (
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  prop_category_id INTEGER NOT NULL REFERENCES prop_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (room_template_id, prop_category_id)
);

-- World level: the actual specific prop instances placed in this room, for
-- this World. Replaces room_template_props as the runtime source for
-- image-generation prop tags (imagePromptBuilder.js's buildSceneTagParts).
CREATE TABLE world_room_props (
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  prop_id INTEGER NOT NULL REFERENCES props(id) ON DELETE CASCADE,
  PRIMARY KEY (world_id, room_template_id, prop_id)
);
CREATE INDEX idx_world_room_props_room ON world_room_props(room_template_id);

-- World level: freeform props (no master row / no category -- pure flavor
-- text, not reflected in image generation, matching existing semantics).
CREATE TABLE world_room_free_props (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  room_template_id INTEGER NOT NULL REFERENCES room_templates(id) ON DELETE CASCADE,
  description TEXT NOT NULL
);
CREATE INDEX idx_world_room_free_props_room ON world_room_free_props(room_template_id, world_id);

-- ---------------------------------------------------------------------------
-- Backfill: every existing room today has exactly one world_id, so this is a
-- lossless 1:1 copy into the new shape.
-- ---------------------------------------------------------------------------

INSERT INTO world_room_templates (world_id, room_template_id)
  SELECT world_id, id FROM room_templates;

-- The admin UI has only ever let you connect rooms within the same World
-- (RoomTemplateEditPage.jsx's connection-target filter), so the origin
-- room's world_id is a safe backfill source for every existing connection.
UPDATE room_connections
  SET world_id = (SELECT world_id FROM room_templates WHERE id = room_connections.from_room_template_id);

-- Seed a common fallback + one common category per distinct pre-existing
-- free-text props.category value (mirrors item_categories' 未分類 seeding).
INSERT INTO prop_categories (world_id, name) VALUES (NULL, '未分類');
INSERT INTO prop_categories (world_id, name)
  SELECT NULL, category FROM (SELECT DISTINCT category FROM props WHERE category IS NOT NULL AND category != '');
UPDATE props SET category_id = (
  SELECT id FROM prop_categories WHERE world_id IS NULL AND name = COALESCE(NULLIF(props.category, ''), '未分類')
);

-- One auto-generated slot per existing (room, character) pairing, with an
-- empty attribute_tags (these are NOT real abstract slots yet -- just a
-- behavior-preserving container so gameplay is unchanged immediately after
-- this migration) and a note recording where it came from, so the user can
-- edit these into real attribute-key slots at their own pace per room.
INSERT INTO room_template_participant_slots (room_template_id, attribute_tags, note, sort_order)
  SELECT room_template_id, '', '(自動移行: 元は' || (SELECT name FROM characters WHERE id = character_id) || '固定)', 0
  FROM room_template_characters;

-- Pin each auto-generated slot to the exact character it originally had, for
-- the room's original (only, pre-migration) World. room_template_characters
-- has a PK on (room_template_id, character_id), so there is at most one row
-- per (room, character) pair -- the join-by-note below is therefore
-- unambiguous for this one-time backfill.
INSERT INTO world_room_slot_assignments (world_id, slot_id, character_id)
  SELECT rt.world_id, s.id, rtc.character_id
  FROM room_template_characters rtc
  JOIN room_templates rt ON rt.id = rtc.room_template_id
  JOIN room_template_participant_slots s
    ON s.room_template_id = rtc.room_template_id
   AND s.note = '(自動移行: 元は' || (SELECT name FROM characters WHERE id = rtc.character_id) || '固定)';

-- Room-master candidate prop categories: derive from whatever categories the
-- room's existing props actually use today.
INSERT INTO room_template_prop_categories (room_template_id, prop_category_id)
  SELECT DISTINCT rtp.room_template_id, p.category_id
  FROM room_template_props rtp JOIN props p ON p.id = rtp.prop_id
  WHERE p.category_id IS NOT NULL;

-- World-level concrete prop placement: copy existing placements 1:1 into the
-- room's original World.
INSERT INTO world_room_props (world_id, room_template_id, prop_id)
  SELECT rt.world_id, rtp.room_template_id, rtp.prop_id
  FROM room_template_props rtp JOIN room_templates rt ON rt.id = rtp.room_template_id;

-- World-level free props: same 1:1 copy into the room's original World.
INSERT INTO world_room_free_props (world_id, room_template_id, description)
  SELECT rt.world_id, rfp.room_template_id, rfp.description
  FROM room_template_free_props rfp JOIN room_templates rt ON rt.id = rfp.room_template_id;
