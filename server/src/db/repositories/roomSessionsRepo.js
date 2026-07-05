import { db } from '../connection.js';
import { getPlaythrough, advanceTime, touchPlaythrough } from './playthroughsRepo.js';

export function ensureRelationshipStatesSeeded(playthroughId, characterId) {
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

  for (const participant of participants) {
    participant.expression_images = participant.current_outfit_id
      ? db
          .prepare(
            `SELECT et.llm_tag_key, oei.image_path
             FROM outfit_expression_images oei
             JOIN expression_types et ON et.id = oei.expression_type_id
             WHERE oei.outfit_id = ?`,
          )
          .all(participant.current_outfit_id)
      : [];
  }

  return { ...session, participants };
}

export function getActiveSessionForPlaythrough(playthroughId) {
  const row = db
    .prepare("SELECT * FROM room_sessions WHERE playthrough_id = ? AND status = 'active'")
    .get(playthroughId);
  return attachParticipants(row);
}

export function getRoomSession(id) {
  const row = db
    .prepare(
      `SELECT rs.*, rt.background_image_path AS room_background_image_path, gi.file_path AS current_scene_image_path
       FROM room_sessions rs
       JOIN room_templates rt ON rt.id = rs.room_template_id
       LEFT JOIN generated_images gi ON gi.id = rs.current_scene_image_id
       WHERE rs.id = ?`,
    )
    .get(id);
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

// Applies a detected [SCENE_CHANGE] to the session's tracked scene state, so
// subsequent image-generation prompts (and the LLM's own context on the next
// turn) reflect the new location rather than the room template's original one.
export function updateSessionScene(id, { locationText, locationTags }) {
  db.prepare(
    `UPDATE room_sessions SET current_location_text = ?, current_location_tags = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(locationText, locationTags, id);
  return getRoomSession(id);
}

export function setCurrentSceneImage(id, generatedImageId) {
  db.prepare('UPDATE room_sessions SET current_scene_image_id = ? WHERE id = ?').run(generatedImageId, id);
}

// Adds a character to a live session (event action character_join), or
// reactivates one who previously left. Also seeds relationship_states for the
// playthrough if this is the character's first appearance in this route.
export function addParticipant(sessionId, characterId, outfitId = null) {
  const session = db.prepare('SELECT playthrough_id FROM room_sessions WHERE id = ?').get(sessionId);
  const resolvedOutfitId = outfitId ?? db.prepare('SELECT id FROM outfits WHERE character_id = ? AND is_default = 1').get(characterId)?.id ?? null;
  const existing = db
    .prepare('SELECT 1 FROM room_session_characters WHERE room_session_id = ? AND character_id = ?')
    .get(sessionId, characterId);
  if (existing) {
    db.prepare(
      `UPDATE room_session_characters SET is_active = 1, current_outfit_id = ?, joined_at = datetime('now'), left_at = NULL
       WHERE room_session_id = ? AND character_id = ?`,
    ).run(resolvedOutfitId, sessionId, characterId);
  } else {
    db.prepare(
      'INSERT INTO room_session_characters (room_session_id, character_id, current_outfit_id, is_active) VALUES (?, ?, ?, 1)',
    ).run(sessionId, characterId, resolvedOutfitId);
  }
  ensureRelationshipStatesSeeded(session.playthrough_id, characterId);
  return getRoomSession(sessionId);
}

export function removeParticipant(sessionId, characterId) {
  db.prepare(
    `UPDATE room_session_characters SET is_active = 0, left_at = datetime('now')
     WHERE room_session_id = ? AND character_id = ?`,
  ).run(sessionId, characterId);
  return getRoomSession(sessionId);
}

export function updateParticipantOutfit(sessionId, characterId, outfitId) {
  db.prepare('UPDATE room_session_characters SET current_outfit_id = ? WHERE room_session_id = ? AND character_id = ?').run(
    outfitId,
    sessionId,
    characterId,
  );
  return getRoomSession(sessionId);
}
