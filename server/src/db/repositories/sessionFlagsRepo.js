import { db } from '../connection.js';

export function getFlag(playthroughId, flagKey) {
  return db.prepare('SELECT * FROM session_flags WHERE playthrough_id = ? AND flag_key = ?').get(playthroughId, flagKey);
}

export function getAllFlags(playthroughId) {
  const rows = db.prepare('SELECT flag_key, flag_value FROM session_flags WHERE playthrough_id = ?').all(playthroughId);
  return Object.fromEntries(rows.map((r) => [r.flag_key, r.flag_value]));
}

export function setFlag(playthroughId, flagKey, value, turnNumber) {
  db.prepare(
    `INSERT INTO session_flags (playthrough_id, flag_key, flag_value, set_at_turn)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (playthrough_id, flag_key) DO UPDATE SET flag_value = excluded.flag_value, set_at_turn = excluded.set_at_turn`,
  ).run(playthroughId, flagKey, String(value), turnNumber);
  return getFlag(playthroughId, flagKey);
}
