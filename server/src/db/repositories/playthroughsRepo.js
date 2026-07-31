import { db } from '../connection.js';
import { getWorld } from './worldsRepo.js';
import { listRegeneratingSelfStatAxes } from './relationshipAxesRepo.js';
import { adjustValue } from './relationshipStatesRepo.js';
import { setFlag, clearFlag, listFlagKeysWithPrefix } from './sessionFlagsRepo.js';
import { listTimers, timerStateFor, timerFlagKey } from './playthroughTimersRepo.js';
import { listHolidaysForWorld } from './worldCalendarHolidaysRepo.js';
import {
  setCharacterFlag,
  clearCharacterFlag,
  listCharacterIdsWithFlag,
  listCharacterFlagsWithPrefix,
} from './characterFlagsRepo.js';
import { listActivePregnancies } from './characterPregnanciesRepo.js';
import { cyclePhaseFor } from '../../services/fertilityCycle.js';
import { pregnancyStateFor } from '../../services/pregnancy.js';

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
  // Same reason, for the per-character derived flags (妊娠しやすさの段階など):
  // without this a cycle_phase condition wouldn't match until the first day
  // rollover. A brand-new route has no pregnancies yet, so only the cycle part
  // does anything here.
  syncDerivedCharacterFlags(result.lastInsertRowid, 1, world);
  return getPlaythrough(result.lastInsertRowid);
}

// room_sessions.playthrough_id is (historically) ON DELETE NO ACTION, unlike
// every other table that references playthroughs directly (character_*_states,
// event_fire_history, playthrough_inventory, relationship_states, session_flags
// are all CASCADE) -- deleting room_sessions explicitly first avoids a foreign
// key violation, and each room_session's own dependents (messages,
// generated_images, room_session_characters, etc.) are all CASCADE on
// room_session_id, so they clean up automatically.
export function deletePlaythrough(id) {
  const del = db.transaction(() => {
    db.prepare('DELETE FROM room_sessions WHERE playthrough_id = ?').run(id);
    db.prepare('DELETE FROM playthroughs WHERE id = ?').run(id);
  });
  del();
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

// Writes each character's derived per-character state into their
// character_flags, so event authors can branch on it with a plain flag_state
// condition (character_id: "mentioned" etc.) — the same reason season/weather
// are mirrored into session flags above. Playthrough scope, matching how long
// these stay meaningful. Two keys today:
//
//   cycle_phase     妊娠しやすさの段階(0070)、妊娠中は「妊娠中」で上書き
//   pregnancy_stage 妊娠の進行段階(0076)、妊娠していないキャラには書かない
//
// Exported so the conceive / end_pregnancy actions can refresh the flags the
// moment they change state — without that, a flag_state condition wouldn't
// match until the next day rollover.
// 汎用タイマー(0083)を flag_state から読めるように写す。キーは timer:<key> で、
// 値は pending / due。キャラ指定のあるものはキャラフラグ、無いものはセッション
// フラグに入る。
//
// 消えたタイマーのフラグは行ごと落とす。値を空にするだけでは flag_state の
// exists 判定に残り続け、期日の来ないイベントが発火可能なままになる
// (pregnancy_stage で同じ問題を踏んでいる)。
export function syncTimerFlags(playthroughId, day) {
  const timers = listTimers(playthroughId);
  const liveCharacterKeys = new Set();
  const liveSessionKeys = new Set();

  for (const timer of timers) {
    const key = timerFlagKey(timer.timer_key);
    const state = timerStateFor(timer, day);
    if (timer.character_id != null) {
      liveCharacterKeys.add(`${timer.character_id}:${key}`);
      setCharacterFlag(timer.character_id, key, 'playthrough', { playthroughId }, state);
    } else {
      liveSessionKeys.add(key);
      setFlag(playthroughId, key, state, null);
    }
  }

  for (const row of listCharacterFlagsWithPrefix('timer:', 'playthrough', { playthroughId })) {
    if (!liveCharacterKeys.has(`${row.character_id}:${row.flag_key}`)) {
      clearCharacterFlag(row.character_id, row.flag_key, 'playthrough', { playthroughId });
    }
  }
  for (const flagKey of listFlagKeysWithPrefix(playthroughId, 'timer:')) {
    if (!liveSessionKeys.has(flagKey)) clearFlag(playthroughId, flagKey);
  }
}

export function syncDerivedCharacterFlags(playthroughId, day, world) {
  syncTimerFlags(playthroughId, day);

  // 妊娠は1回のクエリでまとめて引く。キャラごとに撃つと参加者の数だけ増える。
  const pregnancies = world.pregnancy_enabled
    ? new Map(listActivePregnancies(playthroughId).map((p) => [p.character_id, p]))
    : new Map();

  for (const pregnancy of pregnancies.values()) {
    const state = pregnancyStateFor(pregnancy, { current_day: day }, world);
    if (state) setCharacterFlag(pregnancy.character_id, 'pregnancy_stage', 'playthrough', { playthroughId }, state.stage);
  }
  // 出産・流産で終わったキャラのフラグは消す。値を空にするだけでは
  // flag_state の exists 判定に引っかかり続け、「臨月」を条件にしたイベントが
  // 出産後もずっと発火可能なままになる。
  for (const characterId of listCharacterIdsWithFlag('pregnancy_stage', 'playthrough', { playthroughId })) {
    if (!pregnancies.has(characterId)) {
      clearCharacterFlag(characterId, 'pregnancy_stage', 'playthrough', { playthroughId });
    }
  }

  if (!world.cycle_enabled) return;
  const characters = db.prepare('SELECT id, cycle_enabled, cycle_offset_day FROM characters WHERE cycle_enabled = 1').all();
  for (const character of characters) {
    // 妊娠中のキャラに「最危険」と出続けるのはおかしいので、周期より妊娠を優先する。
    // fertilityCycle.js 自体は妊娠を知らないまま(純粋なまま)にしてある。
    const phase = pregnancies.has(character.id) ? '妊娠中' : cyclePhaseFor(character, { current_day: day }, world);
    if (phase) setCharacterFlag(character.id, 'cycle_phase', 'playthrough', { playthroughId }, phase);
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

  // 妊娠しやすさの段階(0070)と妊娠の進行段階(0076)を、キャラフラグへ反映する。
  // どちらも日付から導出できるのでここに持たせる必要はないが、イベント条件は
  // flag_state しか参照経路が無いため、季節・天候と同じくフラグに写しておく。
  // 日が変わらない時間帯送りでは段階も変わらないので、その時はスキップする。
  if (day !== playthrough.current_day) {
    syncDerivedCharacterFlags(playthroughId, day, world);
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

// Absolute assignment, for the spend_money action's "set" operation —
// adjustMoney above only ever applies a delta.
export function setMoney(playthroughId, amount) {
  db.prepare(`UPDATE playthroughs SET money = ?, updated_at = datetime('now') WHERE id = ?`).run(amount, playthroughId);
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
