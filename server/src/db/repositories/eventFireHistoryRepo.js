import { db } from '../connection.js';

export function recordFire(playthroughId, eventDefinitionId, turnNumber) {
  db.prepare(
    'INSERT INTO event_fire_history (playthrough_id, event_definition_id, fired_at_turn) VALUES (?, ?, ?)',
  ).run(playthroughId, eventDefinitionId, turnNumber);
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
