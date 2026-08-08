import { db } from '../connection.js';
import { isMobCharacter } from './charactersRepo.js';

// Mirrors characterAddressStatesRepo.js's scopeColumns exactly -- see that
// file's comment. Unlike a mob's nickname (which intentionally resets every
// room session), a non-mob character's impression fields persist across the
// whole playthrough on purpose: that continuity is the entire point of this
// feature (0063_character_impression_fields.sql).
function scopeColumns(characterId, playthroughId, roomSessionId, roomSessionCharacterId) {
  if (isMobCharacter(characterId)) {
    return { playthrough_id: null, room_session_id: roomSessionId, room_session_character_id: roomSessionCharacterId ?? null };
  }
  return { playthrough_id: playthroughId, room_session_id: null, room_session_character_id: null };
}

// All current field values for one character in scope, as [{field_key, value}].
// Returns [] if never seeded (caller should ensureImpressionStatesSeeded first
// wherever a character enters play, same as relationship_states).
export function listImpressionValues(playthroughId, characterId, roomSessionId, roomSessionCharacterId) {
  const { playthrough_id, room_session_id, room_session_character_id } = scopeColumns(
    characterId,
    playthroughId,
    roomSessionId,
    roomSessionCharacterId,
  );
  return db
    .prepare(
      `SELECT field_key, value FROM character_impression_states
       WHERE character_id = ? AND playthrough_id IS ? AND room_session_id IS ? AND room_session_character_id IS ?`,
    )
    .all(characterId, playthrough_id, room_session_id, room_session_character_id);
}

// 同上、印象フィールド版。default_valueへのフォールバックはgetImpressionValue()
// には無いが(nullを返すだけ)、一覧表示ではrelationshipStatesRepo.jsの
// listValuesForPlaythroughと同じ理由でフォールバックする。
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
  const defaults = db
    .prepare(`SELECT character_id, field_key, default_value FROM character_impression_defaults WHERE character_id IN (${placeholders})`)
    .all(...characterIds);
  const existing = db
    .prepare(
      `SELECT character_id, field_key, value FROM character_impression_states
       WHERE playthrough_id = ? AND character_id IN (${placeholders})`,
    )
    .all(playthroughId, ...characterIds);
  const existingMap = new Map(existing.map((r) => [`${r.character_id}:${r.field_key}`, r.value]));

  return defaults.map((d) => {
    const key = `${d.character_id}:${d.field_key}`;
    return { character_id: d.character_id, field_key: d.field_key, value: existingMap.has(key) ? existingMap.get(key) : d.default_value };
  });
}

export function getImpressionValue(playthroughId, characterId, fieldKey, roomSessionId, roomSessionCharacterId) {
  const { playthrough_id, room_session_id, room_session_character_id } = scopeColumns(
    characterId,
    playthroughId,
    roomSessionId,
    roomSessionCharacterId,
  );
  const row = db
    .prepare(
      `SELECT value FROM character_impression_states
       WHERE character_id = ? AND field_key = ? AND playthrough_id IS ? AND room_session_id IS ? AND room_session_character_id IS ?`,
    )
    .get(characterId, fieldKey, playthrough_id, room_session_id, room_session_character_id);
  return row?.value ?? null;
}

export function setImpressionValue(playthroughId, characterId, fieldKey, value, roomSessionId, roomSessionCharacterId) {
  const { playthrough_id, room_session_id, room_session_character_id } = scopeColumns(
    characterId,
    playthroughId,
    roomSessionId,
    roomSessionCharacterId,
  );
  const existing = db
    .prepare(
      `SELECT id FROM character_impression_states
       WHERE character_id = ? AND field_key = ? AND playthrough_id IS ? AND room_session_id IS ? AND room_session_character_id IS ?`,
    )
    .get(characterId, fieldKey, playthrough_id, room_session_id, room_session_character_id);
  if (existing) {
    db.prepare(`UPDATE character_impression_states SET value = ?, updated_at = datetime('now') WHERE id = ?`).run(value, existing.id);
  } else {
    db.prepare(
      `INSERT INTO character_impression_states (playthrough_id, room_session_id, room_session_character_id, character_id, field_key, value, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(playthrough_id, room_session_id, room_session_character_id, characterId, fieldKey, value);
  }
  return { field_key: fieldKey, value };
}

// Mirrors ensureRelationshipStatesSeeded (roomSessionsRepo.js) exactly --
// same mob-vs-non-mob seeded-once check, same 3 call sites. A character with
// no character_impression_defaults rows (never configured any fields) is a
// no-op, same as an event/character with no relationship axes overridden.
export function ensureImpressionStatesSeeded(playthroughId, characterId, roomSessionId, roomSessionCharacterId) {
  const isMob = isMobCharacter(characterId);
  const alreadySeeded = isMob
    ? db
        .prepare(
          'SELECT 1 FROM character_impression_states WHERE room_session_id = ? AND character_id = ? AND room_session_character_id IS ? LIMIT 1',
        )
        .get(roomSessionId, characterId, roomSessionCharacterId ?? null)
    : db.prepare('SELECT 1 FROM character_impression_states WHERE playthrough_id = ? AND character_id = ? LIMIT 1').get(playthroughId, characterId);
  if (alreadySeeded) return;
  const defaults = db.prepare('SELECT field_key, default_value FROM character_impression_defaults WHERE character_id = ?').all(characterId);
  for (const d of defaults) {
    db.prepare(
      `INSERT INTO character_impression_states (playthrough_id, room_session_id, room_session_character_id, character_id, field_key, value, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(
      isMob ? null : playthroughId,
      isMob ? roomSessionId : null,
      isMob ? (roomSessionCharacterId ?? null) : null,
      characterId,
      d.field_key,
      d.default_value,
    );
  }
}
