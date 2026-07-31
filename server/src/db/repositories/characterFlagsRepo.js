import { db } from '../connection.js';

// Mirrors characterStatusStatesRepo.js's scopeColumns: persistence_scope
// picks which of playthrough_id/room_session_id is the active key, the
// other stays NULL.
function scopeColumns(scope, playthroughId, roomSessionId) {
  if (scope === 'playthrough') return { playthrough_id: playthroughId, room_session_id: null };
  return { playthrough_id: null, room_session_id: roomSessionId };
}

// Removes the row rather than blanking it: flag_state's "exists"/"not_exists"
// comparisons look at the row, so an emptied value would still read as set.
// Used for flags mirrored from derived state (pregnancy_stage), which have to
// disappear once the thing they describe is over.
export function clearCharacterFlag(characterId, flagKey, scope, ctx) {
  const { playthrough_id, room_session_id } = scopeColumns(scope, ctx.playthroughId, ctx.roomSessionId);
  db.prepare(
    'DELETE FROM character_flags WHERE character_id = ? AND flag_key = ? AND playthrough_id IS ? AND room_session_id IS ?',
  ).run(characterId, flagKey, playthrough_id, room_session_id);
}

// タイマー(0083)のように、キーが動的に増えるフラグの掃除に使う。
export function listCharacterFlagsWithPrefix(prefix, scope, ctx) {
  const { playthrough_id, room_session_id } = scopeColumns(scope, ctx.playthroughId, ctx.roomSessionId);
  return db
    .prepare(
      'SELECT character_id, flag_key FROM character_flags WHERE flag_key LIKE ? AND playthrough_id IS ? AND room_session_id IS ?',
    )
    .all(`${prefix}%`, playthrough_id, room_session_id);
}

export function listCharacterIdsWithFlag(flagKey, scope, ctx) {
  const { playthrough_id, room_session_id } = scopeColumns(scope, ctx.playthroughId, ctx.roomSessionId);
  return db
    .prepare(
      'SELECT character_id FROM character_flags WHERE flag_key = ? AND playthrough_id IS ? AND room_session_id IS ?',
    )
    .all(flagKey, playthrough_id, room_session_id)
    .map((r) => r.character_id);
}

export function getCharacterFlag(characterId, flagKey, scope, ctx) {
  const { playthrough_id, room_session_id } = scopeColumns(scope, ctx.playthroughId, ctx.roomSessionId);
  return db
    .prepare(
      'SELECT * FROM character_flags WHERE character_id = ? AND flag_key = ? AND playthrough_id IS ? AND room_session_id IS ?',
    )
    .get(characterId, flagKey, playthrough_id, room_session_id);
}

// Re-granting an already-set flag updates it in place rather than inserting
// a duplicate row, mirroring characterStatusStatesRepo.js's grantStatus.
export function setCharacterFlag(characterId, flagKey, scope, ctx, value, turnNumber) {
  const { playthrough_id, room_session_id } = scopeColumns(scope, ctx.playthroughId, ctx.roomSessionId);
  const flagValue = String(value);
  const existing = db
    .prepare(
      'SELECT id FROM character_flags WHERE character_id = ? AND flag_key = ? AND playthrough_id IS ? AND room_session_id IS ?',
    )
    .get(characterId, flagKey, playthrough_id, room_session_id);
  if (existing) {
    db.prepare('UPDATE character_flags SET flag_value = ?, set_at_turn = ? WHERE id = ?').run(
      flagValue,
      turnNumber,
      existing.id,
    );
  } else {
    db.prepare(
      `INSERT INTO character_flags (character_id, flag_key, flag_value, persistence_scope, playthrough_id, room_session_id, set_at_turn)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(characterId, flagKey, flagValue, scope, playthrough_id, room_session_id, turnNumber);
  }
  return getCharacterFlag(characterId, flagKey, scope, ctx);
}
