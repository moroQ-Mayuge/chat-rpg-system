import { db } from '../connection.js';

export function recordFire(playthroughId, eventDefinitionId, turnNumber, outcome = null) {
  db.prepare(
    'INSERT INTO event_fire_history (playthrough_id, event_definition_id, fired_at_turn, outcome) VALUES (?, ?, ?, ?)',
  ).run(playthroughId, eventDefinitionId, turnNumber, outcome);
}

// Used by event chaining (prerequisite_event_definition_id): has this event
// ever fired in this playthrough, and if a specific outcome is required, did
// its most recent fire resolve to that outcome?
export function hasFiredWithOutcome(playthroughId, eventDefinitionId, requiredOutcome) {
  if (requiredOutcome === 'any') {
    return getFireCount(playthroughId, eventDefinitionId) > 0;
  }
  const row = db
    .prepare(
      `SELECT outcome FROM event_fire_history
       WHERE playthrough_id = ? AND event_definition_id = ?
       ORDER BY fired_at_turn DESC, id DESC LIMIT 1`,
    )
    .get(playthroughId, eventDefinitionId);
  return row?.outcome === requiredOutcome;
}

export function getFireCount(playthroughId, eventDefinitionId) {
  return db
    .prepare('SELECT COUNT(*) AS c FROM event_fire_history WHERE playthrough_id = ? AND event_definition_id = ?')
    .get(playthroughId, eventDefinitionId).c;
}

// Highest fired_at_turn recorded for this event, or null if it has never fired.
export function getLastFireTurn(playthroughId, eventDefinitionId) {
  const row = db
    .prepare(
      'SELECT MAX(fired_at_turn) AS turn FROM event_fire_history WHERE playthrough_id = ? AND event_definition_id = ?',
    )
    .get(playthroughId, eventDefinitionId);
  return row?.turn ?? null;
}
