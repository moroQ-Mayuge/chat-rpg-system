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

// characterImpressionStatesRepo.jsのlistValuesForPlaythroughと同じ形——このプレイ
// スルーのroom_session_charactersに一度でも登場した非モブキャラ全員を対象に、
// character_address_statesの現在値があればそれを、無ければcharacters.call_user_as
// (初期値)をフォールバックとして返す。デバッグ編集パネル用(モブは対象外——
// character_impression_defaults同様、mob_flavor_call_user_asまで含めた優先順位の
// 解決はここでは行わない簡易版)。
export function listValuesForPlaythrough(playthroughId) {
  const characterIds = db
    .prepare(
      `SELECT DISTINCT rsc.character_id
       FROM room_session_characters rsc
       JOIN room_sessions rs ON rs.id = rsc.room_session_id
       JOIN characters c ON c.id = rsc.character_id
       WHERE rs.playthrough_id = ? AND c.is_mob = 0`,
    )
    .all(playthroughId)
    .map((r) => r.character_id);
  if (characterIds.length === 0) return [];

  const placeholders = characterIds.map(() => '?').join(',');
  const bases = db.prepare(`SELECT id, call_user_as FROM characters WHERE id IN (${placeholders})`).all(...characterIds);
  const existing = db
    .prepare(`SELECT character_id, current_address FROM character_address_states WHERE playthrough_id = ? AND character_id IN (${placeholders})`)
    .all(playthroughId, ...characterIds);
  const existingMap = new Map(existing.map((r) => [r.character_id, r.current_address]));

  return bases.map((c) => ({
    character_id: c.id,
    value: existingMap.has(c.id) ? existingMap.get(c.id) : (c.call_user_as ?? ''),
  }));
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
