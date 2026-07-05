import { db } from '../connection.js';
import { getWorld } from './worldsRepo.js';

function attachLabels(playthrough) {
  if (!playthrough) return playthrough;
  const world = getWorld(playthrough.world_id);
  return {
    ...playthrough,
    current_time_slot_label: world.time_slot_labels[playthrough.current_time_slot_index] ?? null,
    current_season_label: world.season_labels[playthrough.current_season_index] ?? null,
  };
}

export function listPlaythroughsForWorld(worldId) {
  return db
    .prepare('SELECT * FROM playthroughs WHERE world_id = ? ORDER BY updated_at DESC')
    .all(worldId)
    .map(attachLabels);
}

export function getPlaythrough(id) {
  return attachLabels(db.prepare('SELECT * FROM playthroughs WHERE id = ?').get(id));
}

export function createPlaythrough(worldId, name) {
  const world = getWorld(worldId);
  const initialWeather = world.weather_options[0] ?? '';
  const result = db
    .prepare(
      `INSERT INTO playthroughs (world_id, name, current_day, current_time_slot_index, current_weather, current_season_index, status)
       VALUES (?, ?, 1, 0, ?, 0, 'active')`,
    )
    .run(worldId, name, initialWeather);
  return getPlaythrough(result.lastInsertRowid);
}

export function deletePlaythrough(id) {
  db.prepare('DELETE FROM playthroughs WHERE id = ?').run(id);
  return { deleted: true };
}

// Advances the playthrough's calendar by `slots` time-slot steps. On each day
// rollover: reroll weather and recompute the season index from the day count.
// Shared by all three triggers (turn-count, room-exit, advance_time event action) per SPEC.md 3.2.
export function advanceTime(playthroughId, slots = 1) {
  const playthrough = db.prepare('SELECT * FROM playthroughs WHERE id = ?').get(playthroughId);
  const world = getWorld(playthrough.world_id);
  let { current_day: day, current_time_slot_index: slotIndex } = playthrough;
  let weather = playthrough.current_weather;

  for (let i = 0; i < slots; i += 1) {
    slotIndex += 1;
    if (slotIndex >= world.time_slot_labels.length) {
      slotIndex = 0;
      day += 1;
      weather = world.weather_options[Math.floor(Math.random() * world.weather_options.length)] ?? weather;
    }
  }
  const seasonIndex = Math.floor((day - 1) / world.days_per_season) % world.season_labels.length;

  db.prepare(
    `UPDATE playthroughs
     SET current_day = ?, current_time_slot_index = ?, current_weather = ?, current_season_index = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(day, slotIndex, weather, seasonIndex, playthroughId);

  return getPlaythrough(playthroughId);
}

export function touchPlaythrough(id) {
  db.prepare(`UPDATE playthroughs SET updated_at = datetime('now') WHERE id = ?`).run(id);
}
