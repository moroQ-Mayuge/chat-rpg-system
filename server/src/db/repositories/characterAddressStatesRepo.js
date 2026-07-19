import { db } from '../connection.js';
import { isMobCharacter } from './charactersRepo.js';

// Mirrors relationshipStatesRepo.js's scopeColumns -- mob characters'
// nicknames reset every room session instead of persisting for the whole
// playthrough (see 0041_mob_characters.sql). roomSessionCharacterId
// (2026-07-19, migration 0045) further scopes a mob's nickname to one
// specific duplicate instance; non-mobs always get NULL (never duplicated).
function scopeColumns(characterId, playthroughId, roomSessionId, roomSessionCharacterId) {
  if (isMobCharacter(characterId)) {
    return { playthrough_id: null, room_session_id: roomSessionId, room_session_character_id: roomSessionCharacterId ?? null };
  }
  return { playthrough_id: playthroughId, room_session_id: null, room_session_character_id: null };
}

export function getCurrentAddress(playthroughId, characterId, roomSessionId, roomSessionCharacterId) {
  const { playthrough_id, room_session_id, room_session_character_id } = scopeColumns(
    characterId,
    playthroughId,
    roomSessionId,
    roomSessionCharacterId,
  );
  const row = db
    .prepare(
      `SELECT current_address FROM character_address_states
       WHERE character_id = ? AND playthrough_id IS ? AND room_session_id IS ? AND room_session_character_id IS ?`,
    )
    .get(characterId, playthrough_id, room_session_id, room_session_character_id);
  return row?.current_address ?? null;
}

export function setCurrentAddress(playthroughId, characterId, address, roomSessionId, roomSessionCharacterId) {
  const { playthrough_id, room_session_id, room_session_character_id } = scopeColumns(
    characterId,
    playthroughId,
    roomSessionId,
    roomSessionCharacterId,
  );
  const existing = db
    .prepare(
      `SELECT id FROM character_address_states
       WHERE character_id = ? AND playthrough_id IS ? AND room_session_id IS ? AND room_session_character_id IS ?`,
    )
    .get(characterId, playthrough_id, room_session_id, room_session_character_id);
  if (existing) {
    db.prepare(`UPDATE character_address_states SET current_address = ?, updated_at = datetime('now') WHERE id = ?`).run(
      address,
      existing.id,
    );
  } else {
    db.prepare(
      `INSERT INTO character_address_states (playthrough_id, room_session_id, room_session_character_id, character_id, current_address, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    ).run(playthrough_id, room_session_id, room_session_character_id, characterId, address);
  }
  return { current_address: address };
}
