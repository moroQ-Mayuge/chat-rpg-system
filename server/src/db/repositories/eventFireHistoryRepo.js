import { db } from '../connection.js';

export function recordFire(playthroughId, eventDefinitionId, turnNumber, outcome = null, roomSessionId = null) {
  db.prepare(
    'INSERT INTO event_fire_history (playthrough_id, room_session_id, event_definition_id, fired_at_turn, outcome) VALUES (?, ?, ?, ?, ?)',
  ).run(playthroughId, roomSessionId, eventDefinitionId, turnNumber, outcome);
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
export function hasFiredWithOutcome(playthroughId, eventDefinitionId, requiredOutcome, { roomSessionId, resetScope } = {}) {
  if (requiredOutcome === 'any') {
    return getFireCount(playthroughId, eventDefinitionId, { roomSessionId, resetScope }) > 0;
  }
  const { column, value } = scopeClause(playthroughId, { resetScope, roomSessionId });
  const row = db
    .prepare(
      `SELECT outcome FROM event_fire_history
       WHERE ${column} = ? AND event_definition_id = ?
       ORDER BY fired_at_turn DESC, id DESC LIMIT 1`,
    )
    .get(value, eventDefinitionId);
  return row?.outcome === requiredOutcome;
}

export function getFireCount(playthroughId, eventDefinitionId, { roomSessionId, resetScope } = {}) {
  const { column, value } = scopeClause(playthroughId, { resetScope, roomSessionId });
  return db
    .prepare(`SELECT COUNT(*) AS c FROM event_fire_history WHERE ${column} = ? AND event_definition_id = ?`)
    .get(value, eventDefinitionId).c;
}

// Highest fired_at_turn recorded for this event (within scope), or null if
// it has never fired there.
export function getLastFireTurn(playthroughId, eventDefinitionId, { roomSessionId, resetScope } = {}) {
  const { column, value } = scopeClause(playthroughId, { resetScope, roomSessionId });
  const row = db
    .prepare(`SELECT MAX(fired_at_turn) AS turn FROM event_fire_history WHERE ${column} = ? AND event_definition_id = ?`)
    .get(value, eventDefinitionId);
  return row?.turn ?? null;
}
