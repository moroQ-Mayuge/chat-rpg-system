import { db } from '../connection.js';

export function getStatusDisplayPreferences() {
  const row = db.prepare('SELECT settings FROM status_display_preferences WHERE id = 1').get();
  return JSON.parse(row.settings);
}

export function updateStatusDisplayPreferences(settings) {
  db.prepare('UPDATE status_display_preferences SET settings = ? WHERE id = 1').run(JSON.stringify(settings));
  return getStatusDisplayPreferences();
}
