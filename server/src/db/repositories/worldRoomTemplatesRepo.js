import { db } from '../connection.js';

// Membership: which Worlds use which room (many-to-many). Replaces the old
// room_templates.world_id NOT NULL FK for "which World can this room be
// entered in" purposes -- a room can now be attached to several Worlds at once.
export function listRoomTemplatesForWorld(worldId) {
  return db
    .prepare(
      `SELECT rt.* FROM room_templates rt
       JOIN world_room_templates wrt ON wrt.room_template_id = rt.id
       WHERE wrt.world_id = ?
       ORDER BY rt.name ASC`,
    )
    .all(worldId);
}

export function listWorldsForRoomTemplate(roomTemplateId) {
  return db
    .prepare(
      `SELECT w.* FROM worlds w
       JOIN world_room_templates wrt ON wrt.world_id = w.id
       WHERE wrt.room_template_id = ?
       ORDER BY w.name ASC`,
    )
    .all(roomTemplateId);
}

export function isRoomInWorld(worldId, roomTemplateId) {
  return Boolean(
    db.prepare('SELECT 1 FROM world_room_templates WHERE world_id = ? AND room_template_id = ?').get(worldId, roomTemplateId),
  );
}

// Cap on the attribute-tag auto-match population mechanism for this
// (World, room) pair -- see 0054_tag_match_max_count.sql. NULL/absent = no
// cap. Returns null (not 0) when the room isn't attached to the World at
// all, same "no row = no restriction" default as everything else here.
export function getTagMatchMaxCount(worldId, roomTemplateId) {
  const row = db
    .prepare('SELECT tag_match_max_count FROM world_room_templates WHERE world_id = ? AND room_template_id = ?')
    .get(worldId, roomTemplateId);
  return row?.tag_match_max_count ?? null;
}

export function setTagMatchMaxCount(worldId, roomTemplateId, maxCount) {
  db.prepare('UPDATE world_room_templates SET tag_match_max_count = ? WHERE world_id = ? AND room_template_id = ?').run(
    maxCount,
    worldId,
    roomTemplateId,
  );
  return { updated: true };
}

// Seeds the room's attribute_tags from the World's on first attach (only
// when the room doesn't already have its own -- never overwrites an
// existing value, since a shared room master may already be attached to
// other Worlds with intentionally different tags). Just a convenience
// initial value for the room-tag/World-tag fallback in
// worldRoomSlotAssignmentsRepo.js's getContextTags -- editable afterward,
// not a synced/locked relationship.
export function attachRoomToWorld(worldId, roomTemplateId) {
  db.prepare('INSERT OR IGNORE INTO world_room_templates (world_id, room_template_id) VALUES (?, ?)').run(worldId, roomTemplateId);
  const room = db.prepare('SELECT attribute_tags FROM room_templates WHERE id = ?').get(roomTemplateId);
  if (room && !room.attribute_tags) {
    const world = db.prepare('SELECT attribute_tags FROM worlds WHERE id = ?').get(worldId);
    if (world?.attribute_tags) {
      db.prepare('UPDATE room_templates SET attribute_tags = ? WHERE id = ?').run(world.attribute_tags, roomTemplateId);
    }
  }
  return { attached: true };
}

// Detaching a room from a World also clears that World's own configuration
// for the room (slot assignments, prop placements, connections) -- it does
// NOT touch the room master data (slots/candidate categories) or any other
// World's configuration, and does not block on existing room_sessions
// history for that room (matches this app's general "keep history, don't
// hard-block on it" convention elsewhere).
export function detachRoomFromWorld(worldId, roomTemplateId) {
  const tx = db.transaction(() => {
    db.prepare(
      `DELETE FROM world_room_slot_assignments
       WHERE world_id = ? AND slot_id IN (SELECT id FROM room_template_participant_slots WHERE room_template_id = ?)`,
    ).run(worldId, roomTemplateId);
    db.prepare('DELETE FROM world_room_props WHERE world_id = ? AND room_template_id = ?').run(worldId, roomTemplateId);
    db.prepare('DELETE FROM world_room_free_props WHERE world_id = ? AND room_template_id = ?').run(worldId, roomTemplateId);
    db.prepare(
      'DELETE FROM room_connections WHERE world_id = ? AND (from_room_template_id = ? OR to_room_template_id = ?)',
    ).run(worldId, roomTemplateId, roomTemplateId);
    db.prepare('DELETE FROM world_room_templates WHERE world_id = ? AND room_template_id = ?').run(worldId, roomTemplateId);
  });
  tx();
  return { detached: true };
}
