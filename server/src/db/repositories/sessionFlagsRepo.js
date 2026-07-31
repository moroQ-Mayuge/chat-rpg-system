import { db } from '../connection.js';

export function getFlag(playthroughId, flagKey) {
  return db.prepare('SELECT * FROM session_flags WHERE playthrough_id = ? AND flag_key = ?').get(playthroughId, flagKey);
}

export function getAllFlags(playthroughId) {
  const rows = db.prepare('SELECT flag_key, flag_value FROM session_flags WHERE playthrough_id = ?').all(playthroughId);
  return Object.fromEntries(rows.map((r) => [r.flag_key, r.flag_value]));
}

// 派生状態(タイマー)をフラグへ写すとき、消えた分を落とすために使う。値を空に
// するだけでは flag_state の exists 判定に引っかかり続けるため、行ごと消す。
export function clearFlag(playthroughId, flagKey) {
  db.prepare('DELETE FROM session_flags WHERE playthrough_id = ? AND flag_key = ?').run(playthroughId, flagKey);
}

export function listFlagKeysWithPrefix(playthroughId, prefix) {
  return db
    .prepare('SELECT flag_key FROM session_flags WHERE playthrough_id = ? AND flag_key LIKE ?')
    .all(playthroughId, `${prefix}%`)
    .map((r) => r.flag_key);
}

export function setFlag(playthroughId, flagKey, value, turnNumber) {
  db.prepare(
    `INSERT INTO session_flags (playthrough_id, flag_key, flag_value, set_at_turn)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (playthrough_id, flag_key) DO UPDATE SET flag_value = excluded.flag_value, set_at_turn = excluded.set_at_turn`,
  ).run(playthroughId, flagKey, String(value), turnNumber);
  return getFlag(playthroughId, flagKey);
}
