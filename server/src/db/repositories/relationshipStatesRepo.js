import { db } from '../connection.js';
import { evaluateAxisStatusTriggers } from './axisStatusTriggersRepo.js';
import { isMobCharacter } from './charactersRepo.js';

export function getAxis(axisId) {
  return db.prepare('SELECT * FROM relationship_axes WHERE id = ?').get(axisId);
}

// Mob characters (characters.is_mob) never accumulate relationship/self-stat
// state across the whole playthrough -- the same character_id can represent a
// different in-fiction person in several concurrent room_sessions, so their
// values are scoped to room_session_id instead of playthrough_id and simply
// vanish once that session ends. Mirrors character_status_states.js's
// scopeColumns for the 'session' persistence_scope.
//
// roomSessionCharacterId (2026-07-19, migration 0045) further scopes a mob's
// state to one specific duplicate instance within that session -- when two
// simultaneous instances of the same mob are present (see
// room_slot_row_level_random_and_mob_duplication), each can have its own
// relationship value instead of sharing one. Only meaningful for mobs;
// non-mob characters always get NULL here (they're never duplicated).
// Passing undefined/null keeps today's shared-across-instances behavior.
function scopeColumns(characterId, playthroughId, roomSessionId, roomSessionCharacterId) {
  if (isMobCharacter(characterId)) {
    return { playthrough_id: null, room_session_id: roomSessionId, room_session_character_id: roomSessionCharacterId ?? null };
  }
  return { playthrough_id: playthroughId, room_session_id: null, room_session_character_id: null };
}

export function getValue(playthroughId, characterId, axisId, roomSessionId, roomSessionCharacterId) {
  const { playthrough_id, room_session_id, room_session_character_id } = scopeColumns(
    characterId,
    playthroughId,
    roomSessionId,
    roomSessionCharacterId,
  );
  const row = db
    .prepare(
      `SELECT current_value FROM relationship_states
       WHERE character_id = ? AND relationship_axis_id = ? AND playthrough_id IS ? AND room_session_id IS ? AND room_session_character_id IS ?`,
    )
    .get(characterId, axisId, playthrough_id, room_session_id, room_session_character_id);
  if (row) return row.current_value;
  return getAxis(axisId)?.default_value ?? 0;
}

// そのルートに一度でも登場した(room_session_charactersに履歴がある)非モブキャラ
// 全員×全関係性軸を、値が無ければ軸のdefault_valueで埋めて返す。getValue()の
// フォールバック(行が無ければaxis.default_value)と同じ考え方を一覧全体に広げた形。
// 既存行だけを見る前バージョンでは、後から関係が動いていない軸/未シードのキャラが
// 一覧から丸ごと消えていた。
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

  const axes = db.prepare('SELECT id, name, min_value, max_value, default_value FROM relationship_axes ORDER BY id ASC').all();
  const placeholders = characterIds.map(() => '?').join(',');
  const existing = db
    .prepare(
      `SELECT character_id, relationship_axis_id, current_value FROM relationship_states
       WHERE playthrough_id = ? AND character_id IN (${placeholders})`,
    )
    .all(playthroughId, ...characterIds);
  const existingMap = new Map(existing.map((r) => [`${r.character_id}:${r.relationship_axis_id}`, r.current_value]));

  const result = [];
  for (const characterId of characterIds) {
    for (const axis of axes) {
      const key = `${characterId}:${axis.id}`;
      result.push({
        character_id: characterId,
        relationship_axis_id: axis.id,
        axis_name: axis.name,
        min_value: axis.min_value,
        max_value: axis.max_value,
        current_value: existingMap.has(key) ? existingMap.get(key) : axis.default_value,
      });
    }
  }
  return result;
}

function clamp(value, axis) {
  return Math.max(axis.min_value, Math.min(axis.max_value, value));
}

// operation: "add" | "subtract" | "set". Result is clamped to the axis's min/max.
export function adjustValue(playthroughId, characterId, axisId, operation, amount, roomSessionId, roomSessionCharacterId) {
  const axis = getAxis(axisId);
  const current = getValue(playthroughId, characterId, axisId, roomSessionId, roomSessionCharacterId);
  let next = current;
  if (operation === 'add') next = current + amount;
  else if (operation === 'subtract') next = current - amount;
  else if (operation === 'set') next = amount;
  next = clamp(next, axis);

  const { playthrough_id, room_session_id, room_session_character_id } = scopeColumns(
    characterId,
    playthroughId,
    roomSessionId,
    roomSessionCharacterId,
  );
  const existing = db
    .prepare(
      `SELECT id FROM relationship_states
       WHERE character_id = ? AND relationship_axis_id = ? AND playthrough_id IS ? AND room_session_id IS ? AND room_session_character_id IS ?`,
    )
    .get(characterId, axisId, playthrough_id, room_session_id, room_session_character_id);
  if (existing) {
    db.prepare('UPDATE relationship_states SET current_value = ? WHERE id = ?').run(next, existing.id);
  } else {
    db.prepare(
      `INSERT INTO relationship_states (playthrough_id, room_session_id, room_session_character_id, character_id, relationship_axis_id, current_value)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(playthrough_id, room_session_id, room_session_character_id, characterId, axisId, next);
  }

  evaluateAxisStatusTriggers(playthroughId, characterId, axisId, next);

  return next;
}
