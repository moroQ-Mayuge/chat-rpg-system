import { db } from '../connection.js';
import { getWorld } from './worldsRepo.js';
import { listRegeneratingSelfStatAxes } from './relationshipAxesRepo.js';
import { adjustValue } from './relationshipStatesRepo.js';
import { setFlag } from './sessionFlagsRepo.js';
import { listHolidaysForWorld } from './worldCalendarHolidaysRepo.js';

// day is the playthrough's 1-based absolute day count (current_day).
// dayOfYear wraps every days_per_season * season_labels.length days (an
// in-game "year") so a World's calendar holidays repeat identically across
// every playthrough of it, rather than being tied to one specific route.
function calendarInfoForDay(world, day) {
  const dayOfWeekIndex = (day - 1) % world.day_of_week_labels.length;
  const totalDaysInYear = world.days_per_season * world.season_labels.length;
  const dayOfYear = ((day - 1) % totalDaysInYear) + 1;
  const isHoliday =
    world.holiday_weekday_indices.includes(dayOfWeekIndex) ||
    listHolidaysForWorld(world.id).some((h) => h.day_of_year === dayOfYear);
  return { dayOfWeekIndex, dayOfYear, isHoliday };
}

function attachLabels(playthrough) {
  if (!playthrough) return playthrough;
  const world = getWorld(playthrough.world_id);
  const { dayOfWeekIndex, isHoliday } = calendarInfoForDay(world, playthrough.current_day);
  return {
    ...playthrough,
    current_time_slot_label: world.time_slot_labels[playthrough.current_time_slot_index] ?? null,
    current_season_label: world.season_labels[playthrough.current_season_index] ?? null,
    current_day_of_week_label: world.day_of_week_labels[dayOfWeekIndex] ?? null,
    current_is_holiday: isHoliday,
    currency_enabled: world.currency_enabled,
    currency_unit: world.currency_unit,
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
      `INSERT INTO playthroughs (world_id, name, current_day, current_time_slot_index, current_weather, current_season_index, status, money)
       VALUES (?, ?, 1, 0, ?, 0, 'active', ?)`,
    )
    .run(worldId, name, initialWeather, world.initial_money ?? 0);
  // Lets flag_state("season"/"time_slot"/"weather"/"day_of_week"/"is_holiday", ...)
  // event conditions work from turn 1, not just after the first change (see
  // advanceTime's matching update).
  setFlag(result.lastInsertRowid, 'season', world.season_labels[0] ?? '', null);
  setFlag(result.lastInsertRowid, 'time_slot', world.time_slot_labels[0] ?? '', null);
  setFlag(result.lastInsertRowid, 'weather', initialWeather, null);
  const { dayOfWeekIndex, isHoliday } = calendarInfoForDay(world, 1);
  setFlag(result.lastInsertRowid, 'day_of_week', world.day_of_week_labels[dayOfWeekIndex] ?? '', null);
  setFlag(result.lastInsertRowid, 'is_holiday', isHoliday ? 'true' : 'false', null);
  return getPlaythrough(result.lastInsertRowid);
}

export function deletePlaythrough(id) {
  db.prepare('DELETE FROM playthroughs WHERE id = ?').run(id);
  return { deleted: true };
}

// Self-stat axes with a configured regen_per_time_slot passively drift every
// time slot, for every character already introduced in this playthrough
// (has at least one relationship_states row here) — applies regardless of
// whether that character is present in the current session, per design
// (自己ステータス／キャラ状態システム, ROADMAP.md).
function applySelfStatRegen(playthroughId, slots) {
  const axes = listRegeneratingSelfStatAxes();
  if (axes.length === 0) return;
  const characterIds = db
    .prepare('SELECT DISTINCT character_id FROM relationship_states WHERE playthrough_id = ?')
    .all(playthroughId)
    .map((r) => r.character_id);
  for (const axis of axes) {
    for (const characterId of characterIds) {
      adjustValue(playthroughId, characterId, axis.id, 'add', axis.regen_per_time_slot * slots);
    }
  }
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
  const { dayOfWeekIndex, isHoliday } = calendarInfoForDay(world, day);

  db.prepare(
    `UPDATE playthroughs
     SET current_day = ?, current_time_slot_index = ?, current_weather = ?, current_season_index = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).run(day, slotIndex, weather, seasonIndex, playthroughId);

  // Lets event authors gate content on the current season/time-of-day/weather/
  // day-of-week/holiday status via a plain flag_state condition, since no
  // dedicated condition type for any of these exists.
  if (seasonIndex !== playthrough.current_season_index) {
    setFlag(playthroughId, 'season', world.season_labels[seasonIndex] ?? '', null);
  }
  if (slotIndex !== playthrough.current_time_slot_index) {
    setFlag(playthroughId, 'time_slot', world.time_slot_labels[slotIndex] ?? '', null);
  }
  if (weather !== playthrough.current_weather) {
    setFlag(playthroughId, 'weather', weather ?? '', null);
  }
  const previousCalendarInfo = calendarInfoForDay(world, playthrough.current_day);
  if (dayOfWeekIndex !== previousCalendarInfo.dayOfWeekIndex) {
    setFlag(playthroughId, 'day_of_week', world.day_of_week_labels[dayOfWeekIndex] ?? '', null);
  }
  if (isHoliday !== previousCalendarInfo.isHoliday) {
    setFlag(playthroughId, 'is_holiday', isHoliday ? 'true' : 'false', null);
  }

  applySelfStatRegen(playthroughId, slots);

  return getPlaythrough(playthroughId);
}

export function getMoney(playthroughId) {
  return db.prepare('SELECT money FROM playthroughs WHERE id = ?').get(playthroughId)?.money ?? 0;
}

// delta may be negative (purchase) or positive (sale). No floor at 0 is
// enforced here — callers (roomSessions.js's purchase flow) are responsible
// for checking sufficient funds before calling this with a negative delta,
// per the shopping feature's "block, don't go negative" design.
export function adjustMoney(playthroughId, delta) {
  db.prepare(`UPDATE playthroughs SET money = money + ?, updated_at = datetime('now') WHERE id = ?`).run(delta, playthroughId);
  return getMoney(playthroughId);
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
