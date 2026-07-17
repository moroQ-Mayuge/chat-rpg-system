import { db } from '../connection.js';
import { isMobCharacter } from './charactersRepo.js';

// Mirrors relationshipStatesRepo.js's scopeColumns -- mob characters'
// nicknames reset every room session instead of persisting for the whole
// playthrough (see 0041_mob_characters.sql).
function scopeColumns(characterId, playthroughId, roomSessionId) {
  if (isMobCharacter(characterId)) {
    return { playthrough_id: null, room_session_id: roomSessionId };
  }
  return { playthrough_id: playthroughId, room_session_id: null };
}

export function getCurrentAddress(playthroughId, characterId, roomSessionId) {
  const { playthrough_id, room_session_id } = scopeColumns(characterId, playthroughId, roomSessionId);
  const row = db
    .prepare('SELECT current_address FROM character_address_states WHERE character_id = ? AND playthrough_id IS ? AND room_session_id IS ?')
    .get(characterId, playthrough_id, room_session_id);
  return row?.current_address ?? null;
}

export function setCurrentAddress(playthroughId, characterId, address, roomSessionId) {
  const { playthrough_id, room_session_id } = scopeColumns(characterId, playthroughId, roomSessionId);
  const existing = db
    .prepare('SELECT id FROM character_address_states WHERE character_id = ? AND playthrough_id IS ? AND room_session_id IS ?')
    .get(characterId, playthrough_id, room_session_id);
  if (existing) {
    db.prepare(`UPDATE character_address_states SET current_address = ?, updated_at = datetime('now') WHERE id = ?`).run(
      address,
      existing.id,
    );
  } else {
    db.prepare(
      `INSERT INTO character_address_states (playthrough_id, room_session_id, character_id, current_address, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    ).run(playthrough_id, room_session_id, characterId, address);
  }
  return { current_address: address };
}
