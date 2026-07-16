import { db } from '../connection.js';

export function listHolidaysForWorld(worldId) {
  return db.prepare('SELECT * FROM world_calendar_holidays WHERE world_id = ? ORDER BY day_of_year ASC').all(worldId);
}

export function getHoliday(id) {
  return db.prepare('SELECT * FROM world_calendar_holidays WHERE id = ?').get(id);
}

export function createHoliday({ world_id, day_of_year, label }) {
  const result = db
    .prepare('INSERT INTO world_calendar_holidays (world_id, day_of_year, label) VALUES (?, ?, ?)')
    .run(world_id, day_of_year, label ?? '');
  return getHoliday(result.lastInsertRowid);
}

export function updateHoliday(id, { day_of_year, label }) {
  db.prepare('UPDATE world_calendar_holidays SET day_of_year = ?, label = ? WHERE id = ?').run(day_of_year, label ?? '', id);
  return getHoliday(id);
}

export function deleteHoliday(id) {
  db.prepare('DELETE FROM world_calendar_holidays WHERE id = ?').run(id);
  return { deleted: true };
}
