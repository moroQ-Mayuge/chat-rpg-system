import { db } from '../connection.js';

// characterId is optional everywhere below (default null). "IS ?" rather
// than "= ?" so a NULL characterId matches NULL rows -- SQL's "= NULL" is
// never true, which would silently break every non-per_character_firing
// event (the overwhelming majority; their rows are always character_id IS
// NULL, see 0086_per_character_event_firing.sql).
export function recordFire(playthroughId, eventDefinitionId, turnNumber, outcome = null, roomSessionId = null, characterId = null) {
  db.prepare(
    'INSERT INTO event_fire_history (playthrough_id, room_session_id, event_definition_id, fired_at_turn, outcome, character_id) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(playthroughId, roomSessionId, eventDefinitionId, turnNumber, outcome, characterId);
}

// Whether a query should accumulate over the whole route (playthrough_id) or
// just the current room stay (room_session_id) -- see 0037_event_fire_reset_scope.sql.
// `value` is always the actual id to bind -- callers never need a fallback.
function scopeClause(playthroughId, { resetScope, roomSessionId }) {
  return resetScope === 'session'
    ? { column: 'room_session_id', value: roomSessionId }
    : { column: 'playthrough_id', value: playthroughId };
}

// Used by event chaining (prerequisite_event_definition_id): has this event
// ever fired (within the requesting event's chosen scope), and if a specific
// outcome is required, did its most recent fire resolve to that outcome?
// characterId left at its default (null) here deliberately: a prerequisite
// chain asks "has this event fired for anyone", not for one specific
// character, even when the prerequisite itself is per_character_firing.
export function hasFiredWithOutcome(playthroughId, eventDefinitionId, requiredOutcome, { roomSessionId, resetScope, characterId = null } = {}) {
  if (requiredOutcome === 'any') {
    return getFireCount(playthroughId, eventDefinitionId, { roomSessionId, resetScope, characterId }) > 0;
  }
  const { column, value } = scopeClause(playthroughId, { resetScope, roomSessionId });
  const row = db
    .prepare(
      `SELECT outcome FROM event_fire_history
       WHERE ${column} = ? AND event_definition_id = ? AND character_id IS ?
       ORDER BY fired_at_turn DESC, id DESC LIMIT 1`,
    )
    .get(value, eventDefinitionId, characterId);
  return row?.outcome === requiredOutcome;
}

// characterId set -> counts only that character's own fires (per_character_firing's
// per-candidate max_fires gate). Left null -> counts only character_id-less
// rows, i.e. unchanged behavior for every event that isn't per_character_firing.
export function getFireCount(playthroughId, eventDefinitionId, { roomSessionId, resetScope, characterId = null } = {}) {
  const { column, value } = scopeClause(playthroughId, { resetScope, roomSessionId });
  return db
    .prepare(`SELECT COUNT(*) AS c FROM event_fire_history WHERE ${column} = ? AND event_definition_id = ? AND character_id IS ?`)
    .get(value, eventDefinitionId, characterId).c;
}

// Highest fired_at_turn recorded for this event (within scope), or null if
// it has never fired there.
export function getLastFireTurn(playthroughId, eventDefinitionId, { roomSessionId, resetScope, characterId = null } = {}) {
  const { column, value } = scopeClause(playthroughId, { resetScope, roomSessionId });
  const row = db
    .prepare(`SELECT MAX(fired_at_turn) AS turn FROM event_fire_history WHERE ${column} = ? AND event_definition_id = ? AND character_id IS ?`)
    .get(value, eventDefinitionId, characterId);
  return row?.turn ?? null;
}
