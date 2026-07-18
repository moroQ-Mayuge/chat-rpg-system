import { db } from '../connection.js';
import { getPlaythrough, advanceTime, touchPlaythrough } from './playthroughsRepo.js';
import { carryOverAccompanyingStatuses } from './characterStatusStatesRepo.js';
import { buildStatusSnapshot } from './statusSnapshotRepo.js';
import { getStatusDisplayPreferences } from './statusDisplayPreferencesRepo.js';
import { listDefaultParticipantCharacterIdsForWorldRoom } from './worldRoomSlotAssignmentsRepo.js';
import { isMobCharacter } from './charactersRepo.js';

const STATUS_DISPLAY_LOCATIONS = ['strip', 'panel', 'chat_log'];
const STATUS_DISPLAY_CATEGORIES = ['self_stat', 'status', 'relationship_stage'];

// World settings are a ceiling, player preferences narrow within it — a
// category is only ever visible when BOTH agree (see 0027_status_display_settings.sql).
function computeStatusDisplayVisibility(worldSettings, playerPrefs) {
  const visibility = {};
  for (const location of STATUS_DISPLAY_LOCATIONS) {
    visibility[location] = {};
    for (const category of STATUS_DISPLAY_CATEGORIES) {
      visibility[location][category] = Boolean(worldSettings[location][category]) && Boolean(playerPrefs[location][category]);
    }
  }
  return visibility;
}

// Mob characters (characters.is_mob) are seeded per room_session instead of
// per playthrough, so a fresh session always starts them at their defaults
// again -- see 0041_mob_characters.sql / relationshipStatesRepo.js.
export function ensureRelationshipStatesSeeded(playthroughId, characterId, roomSessionId) {
  const isMob = isMobCharacter(characterId);
  const scopeColumn = isMob ? 'room_session_id' : 'playthrough_id';
  const scopeValue = isMob ? roomSessionId : playthroughId;
  const alreadySeeded = db
    .prepare(`SELECT 1 FROM relationship_states WHERE ${scopeColumn} = ? AND character_id = ? LIMIT 1`)
    .get(scopeValue, characterId);
  if (alreadySeeded) return;
  const defaults = db
    .prepare('SELECT relationship_axis_id, initial_value FROM character_relationship_defaults WHERE character_id = ?')
    .all(characterId);
  for (const d of defaults) {
    db.prepare(
      'INSERT INTO relationship_states (playthrough_id, room_session_id, character_id, relationship_axis_id, current_value) VALUES (?, ?, ?, ?, ?)',
    ).run(isMob ? null : playthroughId, isMob ? roomSessionId : null, characterId, d.relationship_axis_id, d.initial_value);
  }
}

function attachParticipants(session) {
  if (!session) return session;
  const participants = db
    .prepare(
      `SELECT rsc.id, rsc.character_id, c.name, rsc.current_outfit_id, rsc.is_active, rsc.is_accompanying
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
    participant.status = buildStatusSnapshot(session.playthrough_id, participant.character_id, { roomSessionId: session.id });
  }

  const worldRow = db
    .prepare('SELECT w.status_display_settings FROM worlds w JOIN playthroughs p ON p.world_id = w.id WHERE p.id = ?')
    .get(session.playthrough_id);
  const worldSettings = JSON.parse(worldRow.status_display_settings);
  const playerPrefs = getStatusDisplayPreferences();
  const status_display_visibility = computeStatusDisplayVisibility(worldSettings, playerPrefs);

  return { ...session, participants, status_display_visibility };
}

// Lists every session (active or ended) a playthrough has ever had, newest
// first — the browsable "log" of past room/place visits (Room→Place design
// decision: sessions still reset on each move, but their message history
// stays reachable afterward rather than becoming permanently invisible).
export function listSessionsForPlaythrough(playthroughId) {
  return db
    .prepare(
      `SELECT rs.id, rs.room_template_id, rt.name AS room_name, rs.status,
              rs.entered_day, rs.entered_time_slot_index, rs.started_at, rs.updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.room_session_id = rs.id) AS message_count
       FROM room_sessions rs
       JOIN room_templates rt ON rt.id = rs.room_template_id
       WHERE rs.playthrough_id = ?
       ORDER BY rs.started_at DESC`,
    )
    .all(playthroughId);
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
      `SELECT rs.*, rt.background_image_path AS room_background_image_path, rt.is_place AS room_is_place, gi.file_path AS current_scene_image_path
       FROM room_sessions rs
       JOIN room_templates rt ON rt.id = rs.room_template_id
       LEFT JOIN generated_images gi ON gi.id = rs.current_scene_image_id
       WHERE rs.id = ?`,
    )
    .get(id);
  return attachParticipants(row);
}

// options.carryOverParticipants: participants from a session being left via
// a move-to-connected-place action (room移動), whose is_accompanying flag was
// set — they join the new session's cast alongside its own default
// participants, keeping the accompanying flag so they continue to follow
// through further moves. Unflagged participants from the old session are
// simply left behind (never passed in).
// options.fromRoomSessionId: the session being left, used to carry forward
// each carried-over character's 'accompanying'-scoped character statuses
// (session/playthrough-scoped statuses reset or persist on their own terms).
export function createRoomSession(playthroughId, roomTemplateId, options = {}) {
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

  const carryOverByCharacterId = new Map(
    (options.carryOverParticipants ?? []).map((p) => [p.character_id, p]),
  );

  // Default participants are now resolved per-World: the room master only
  // declares abstract slots (room_template_participant_slots), and which
  // concrete character fills each slot is a per-World decision
  // (world_room_slot_assignments) — see 0030_room_world_decoupling.sql.
  const defaultParticipantIds = listDefaultParticipantCharacterIdsForWorldRoom(
    playthrough.world_id,
    roomTemplateId,
    playthrough.current_time_slot_index,
  );
  for (const characterId of defaultParticipantIds) {
    const carryOver = carryOverByCharacterId.get(characterId);
    const defaultOutfit = db
      .prepare('SELECT id FROM outfits WHERE character_id = ? AND is_default = 1')
      .get(characterId);
    db.prepare(
      'INSERT INTO room_session_characters (room_session_id, character_id, current_outfit_id, is_active, is_accompanying) VALUES (?, ?, ?, 1, ?)',
    ).run(sessionId, characterId, carryOver?.current_outfit_id ?? defaultOutfit?.id ?? null, carryOver ? 1 : 0);
    ensureRelationshipStatesSeeded(playthroughId, characterId, sessionId);
    if (carryOver && options.fromRoomSessionId != null) {
      carryOverAccompanyingStatuses(characterId, options.fromRoomSessionId, sessionId);
    }
    carryOverByCharacterId.delete(characterId);
  }

  // Remaining carry-over participants aren't part of the new room's own cast
  // — they're only present because they're accompanying the player.
  for (const carryOver of carryOverByCharacterId.values()) {
    db.prepare(
      'INSERT INTO room_session_characters (room_session_id, character_id, current_outfit_id, is_active, is_accompanying) VALUES (?, ?, ?, 1, 1)',
    ).run(sessionId, carryOver.character_id, carryOver.current_outfit_id ?? null);
    ensureRelationshipStatesSeeded(playthroughId, carryOver.character_id, sessionId);
    if (options.fromRoomSessionId != null) {
      carryOverAccompanyingStatuses(carryOver.character_id, options.fromRoomSessionId, sessionId);
    }
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

// Ends a session as part of a room連結 move (room移動) rather than a full
// exit — deliberately does NOT advance time itself; the caller applies the
// connection's movement_cost via playthroughsRepo.applyMovementCost instead,
// which only advances a time-slot once the sub-count budget is exhausted.
export function endSessionForMove(id) {
  db.prepare(`UPDATE room_sessions SET status = 'ended', updated_at = datetime('now') WHERE id = ?`).run(id);
  return getRoomSession(id);
}

export function setAccompanying(sessionId, characterId, isAccompanying) {
  db.prepare('UPDATE room_session_characters SET is_accompanying = ? WHERE room_session_id = ? AND character_id = ?').run(
    isAccompanying ? 1 : 0,
    sessionId,
    characterId,
  );
  return getRoomSession(sessionId);
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
  ensureRelationshipStatesSeeded(session.playthrough_id, characterId, sessionId);
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
