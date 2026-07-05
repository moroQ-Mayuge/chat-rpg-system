import { db } from '../connection.js';
import { getPlaythrough, advanceTime, touchPlaythrough } from './playthroughsRepo.js';

function ensureRelationshipStatesSeeded(playthroughId, characterId) {
  const alreadySeeded = db
    .prepare('SELECT 1 FROM relationship_states WHERE playthrough_id = ? AND character_id = ? LIMIT 1')
    .get(playthroughId, characterId);
  if (alreadySeeded) return;
  const defaults = db
    .prepare('SELECT relationship_axis_id, initial_value FROM character_relationship_defaults WHERE character_id = ?')
    .all(characterId);
  for (const d of defaults) {
    db.prepare(
      'INSERT INTO relationship_states (playthrough_id, character_id, relationship_axis_id, current_value) VALUES (?, ?, ?, ?)',
    ).run(playthroughId, characterId, d.relationship_axis_id, d.initial_value);
  }
}

function attachParticipants(session) {
  if (!session) return session;
  const participants = db
    .prepare(
      `SELECT rsc.character_id, c.name, rsc.current_outfit_id, rsc.is_active
       FROM room_session_characters rsc
       JOIN characters c ON c.id = rsc.character_id
       WHERE rsc.room_session_id = ? AND rsc.is_active = 1`,
    )
    .all(session.id);
  return { ...session, participants };
}

export function getActiveSessionForPlaythrough(playthroughId) {
  const row = db
    .prepare("SELECT * FROM room_sessions WHERE playthrough_id = ? AND status = 'active'")
    .get(playthroughId);
  return attachParticipants(row);
}

export function getRoomSession(id) {
  const row = db.prepare('SELECT * FROM room_sessions WHERE id = ?').get(id);
  return attachParticipants(row);
}

export function createRoomSession(playthroughId, roomTemplateId) {
  const playthrough = getPlaythrough(playthroughId);
  const template = db.prepare('SELECT * FROM room_templates WHERE id = ?').get(roomTemplateId);

  const result = db
    .prepare(
      `INSERT INTO room_sessions
        (room_template_id, playthrough_id, entered_day, entered_time_slot_index,
         current_location_text, current_location_tags, current_atmosphere_text, current_atmosphere_tags, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    )
    .run(
      roomTemplateId,
      playthroughId,
      playthrough.current_day,
      playthrough.current_time_slot_index,
      template.location_text,
      template.location_tags,
      template.atmosphere_text,
      template.atmosphere_tags,
    );
  const sessionId = result.lastInsertRowid;

  const defaultParticipants = db
    .prepare('SELECT character_id FROM room_template_characters WHERE room_template_id = ? AND is_default_participant = 1')
    .all(roomTemplateId);
  for (const { character_id: characterId } of defaultParticipants) {
    const defaultOutfit = db
      .prepare('SELECT id FROM outfits WHERE character_id = ? AND is_default = 1')
      .get(characterId);
    db.prepare(
      'INSERT INTO room_session_characters (room_session_id, character_id, current_outfit_id, is_active) VALUES (?, ?, ?, 1)',
    ).run(sessionId, characterId, defaultOutfit?.id ?? null);
    ensureRelationshipStatesSeeded(playthroughId, characterId);
  }

  touchPlaythrough(playthroughId);
  return getRoomSession(sessionId);
}

export function exitRoomSession(id) {
  const session = getRoomSession(id);
  db.prepare(`UPDATE room_sessions SET status = 'ended', updated_at = datetime('now') WHERE id = ?`).run(id);
  const updatedPlaythrough = advanceTime(session.playthrough_id, 1);
  return { session: getRoomSession(id), playthrough: updatedPlaythrough };
}

export function touchRoomSession(id) {
  db.prepare(`UPDATE room_sessions SET updated_at = datetime('now') WHERE id = ?`).run(id);
}
