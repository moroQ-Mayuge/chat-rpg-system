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

// Adds a room-connection's movement_cost to the playthrough's running
// sub-count. When the sub-count reaches the World's configured budget for one
// time-slot, the time-slot advances (via the shared advanceTime) and the
// sub-count resets to 0 — the remainder is discarded, not carried over
// (chosen for simplicity over fairness, per design decision).
export function applyMovementCost(playthroughId, cost) {
  const playthrough = db.prepare('SELECT * FROM playthroughs WHERE id = ?').get(playthroughId);
  const world = getWorld(playthrough.world_id);
  const newSubcount = playthrough.current_movement_subcount + cost;

  if (newSubcount >= world.movement_points_per_time_slot) {
    db.prepare('UPDATE playthroughs SET current_movement_subcount = 0 WHERE id = ?').run(playthroughId);
    return advanceTime(playthroughId, 1);
  }

  db.prepare(`UPDATE playthroughs SET current_movement_subcount = ?, updated_at = datetime('now') WHERE id = ?`).run(
    newSubcount,
    playthroughId,
  );
  return getPlaythrough(playthroughId);
}

export function updateProtagonistSettings(
  id,
  {
    use_custom_protagonist,
    protagonist_name,
    protagonist_nickname,
    protagonist_occupation,
    protagonist_appearance,
    protagonist_gender,
    protagonist_notes,
    protagonist_mode,
  },
) {
  db.prepare(
    `UPDATE playthroughs
     SET use_custom_protagonist = ?, protagonist_name = ?, protagonist_nickname = ?, protagonist_occupation = ?, protagonist_appearance = ?,
         protagonist_gender = ?, protagonist_notes = ?, protagonist_mode = ?
     WHERE id = ?`,
  ).run(
    use_custom_protagonist ? 1 : 0,
    protagonist_name ?? '',
    protagonist_nickname ?? '',
    protagonist_occupation ?? '',
    protagonist_appearance ?? '',
    protagonist_gender ?? '',
    protagonist_notes ?? '',
    protagonist_mode ?? 'character',
    id,
  );
  return getPlaythrough(id);
}

// Resolves the protagonist ("あなた") setup actually in effect for a
// playthrough: its own override if use_custom_protagonist is set, otherwise
// falls back to its World's default. Always returns a { mode, ...fields }
// object — never null — so the prompt builder decides what (if anything) to
// render based on mode:
//   'character' — the protagonist is a present person; renders an identity
//     block from the fields below, or nothing if every field is blank.
//   'narrator'  — the human user isn't a character at all (a god/GM
//     viewpoint that can directly dictate scene/NPC behavior); the fields
//     below are irrelevant in this mode.
export function resolveProtagonist(playthroughId) {
  const playthrough = db.prepare('SELECT * FROM playthroughs WHERE id = ?').get(playthroughId);
  if (!playthrough) return { mode: 'character', name: '', nickname: '', occupation: '', appearance: '', gender: '', notes: '' };

  const source = playthrough.use_custom_protagonist
    ? playthrough
    : getWorld(playthrough.world_id);

  return {
    mode: source.protagonist_mode ?? 'character',
    name: source.protagonist_name ?? '',
    nickname: source.protagonist_nickname ?? '',
    occupation: source.protagonist_occupation ?? '',
    appearance: source.protagonist_appearance ?? '',
    gender: source.protagonist_gender ?? '',
    notes: source.protagonist_notes ?? '',
  };
}
