import { db } from '../connection.js';

// 汎用タイマー(0083)の読み書き。期日が来たかの判定は日付の比較だけなので、
// 妊娠や周期と同じく状態は持たず current_day との差で毎回決める。

// 同じキー・同じ対象は1本だけ。張り直すと期日が更新される(「約束を延ばす」)。
export function setTimer(playthroughId, timerKey, { characterId = null, startDay, dueDay, note = '' }) {
  db.prepare(
    `INSERT INTO playthrough_timers (playthrough_id, timer_key, character_id, start_day, due_day, note)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (playthrough_id, timer_key, COALESCE(character_id, 0))
     DO UPDATE SET start_day = excluded.start_day, due_day = excluded.due_day, note = excluded.note`,
  ).run(playthroughId, timerKey, characterId, startDay, dueDay, note);
  return getTimer(playthroughId, timerKey, characterId);
}

export function getTimer(playthroughId, timerKey, characterId = null) {
  return db
    .prepare(
      'SELECT * FROM playthrough_timers WHERE playthrough_id = ? AND timer_key = ? AND character_id IS ?',
    )
    .get(playthroughId, timerKey, characterId);
}

export function clearTimer(playthroughId, timerKey, characterId = null) {
  const info = db
    .prepare('DELETE FROM playthrough_timers WHERE playthrough_id = ? AND timer_key = ? AND character_id IS ?')
    .run(playthroughId, timerKey, characterId);
  return { cleared: info.changes > 0 };
}

export function listTimers(playthroughId) {
  return db.prepare('SELECT * FROM playthrough_timers WHERE playthrough_id = ? ORDER BY due_day, id').all(playthroughId);
}

// フラグに写す値。期日当日を含めて due にする——「30日後に戻る」と書いたなら
// 30日目に成立してほしい。
export function timerStateFor(timer, currentDay) {
  if (!timer) return null;
  return currentDay >= timer.due_day ? 'due' : 'pending';
}

// フラグキーの綴り。イベント側は flag_state でこの名前を読む。
export function timerFlagKey(timerKey) {
  return `timer:${timerKey}`;
}
