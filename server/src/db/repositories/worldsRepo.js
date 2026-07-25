import { db } from '../connection.js';

function parseWorld(row) {
  if (!row) return row;
  return {
    ...row,
    is_unassigned_bucket: Boolean(row.is_unassigned_bucket),
    currency_enabled: Boolean(row.currency_enabled),
    self_stat_auto_update_enabled: Boolean(row.self_stat_auto_update_enabled),
    mature_content_mode_enabled: Boolean(row.mature_content_mode_enabled),
    refusal_detection_enabled: Boolean(row.refusal_detection_enabled),
    impression_auto_update_enabled: Boolean(row.impression_auto_update_enabled),
    memory_auto_extract_enabled: Boolean(row.memory_auto_extract_enabled),
    memory_editing_visible: Boolean(row.memory_editing_visible),
    time_slot_labels: JSON.parse(row.time_slot_labels),
    weather_options: JSON.parse(row.weather_options),
    season_labels: JSON.parse(row.season_labels),
    day_of_week_labels: JSON.parse(row.day_of_week_labels),
    holiday_weekday_indices: JSON.parse(row.holiday_weekday_indices),
    status_display_settings: JSON.parse(row.status_display_settings),
    weather_tag_map: JSON.parse(row.weather_tag_map),
    time_slot_tag_map: JSON.parse(row.time_slot_tag_map),
  };
}

// last_played_at: most recent playthroughs.updated_at across this World's
// routes (kept fresh by touchPlaythrough/advanceTime/applyMovementCost during
// real gameplay), null if the World has never been played. Sorting itself
// happens client-side (WorldsPage.jsx) — this just makes the data available.
export function listWorlds() {
  return db
    .prepare(
      `SELECT w.*, (SELECT MAX(p.updated_at) FROM playthroughs p WHERE p.world_id = w.id) AS last_played_at
       FROM worlds w
       ORDER BY w.is_unassigned_bucket ASC, w.name ASC`,
    )
    .all()
    .map(parseWorld);
}

export function getWorld(id) {
  return parseWorld(db.prepare('SELECT * FROM worlds WHERE id = ?').get(id));
}

export function getUnassignedWorld() {
  return parseWorld(db.prepare('SELECT * FROM worlds WHERE is_unassigned_bucket = 1').get());
}

const DEFAULT_TIME_SLOT_LABELS = ['朝', '昼', '放課後', '夜'];
const DEFAULT_WEATHER_OPTIONS = ['晴れ', '曇り', '雨'];
const DEFAULT_SEASON_LABELS = ['春', '夏', '秋', '冬'];
const DEFAULT_DAYS_PER_SEASON = 30;
const DEFAULT_DAY_OF_WEEK_LABELS = ['月', '火', '水', '木', '金', '土', '日'];
const DEFAULT_HOLIDAY_WEEKDAY_INDICES = [];
const DEFAULT_STATUS_DISPLAY_SETTINGS = {
  strip: { self_stat: false, status: false, relationship_stage: false },
  panel: { self_stat: false, status: false, relationship_stage: false },
  chat_log: { self_stat: false, status: false, relationship_stage: false },
};

export function createWorld({
  name,
  worldview,
  time_slot_labels = DEFAULT_TIME_SLOT_LABELS,
  weather_options = DEFAULT_WEATHER_OPTIONS,
  season_labels = DEFAULT_SEASON_LABELS,
  days_per_season = DEFAULT_DAYS_PER_SEASON,
  day_of_week_labels = DEFAULT_DAY_OF_WEEK_LABELS,
  holiday_weekday_indices = DEFAULT_HOLIDAY_WEEKDAY_INDICES,
  image_style_preset_id = null,
  image_tags = '',
  protagonist_name = '',
  protagonist_nickname = '',
  protagonist_occupation = '',
  protagonist_appearance = '',
  protagonist_gender = '',
  protagonist_notes = '',
  protagonist_mode = 'character',
  attribute_tags = '',
  movement_points_per_time_slot = 4,
  max_response_tokens = null,
  notify_relationship_changes = false,
  status_display_settings = DEFAULT_STATUS_DISPLAY_SETTINGS,
  currency_enabled = false,
  currency_unit = '円',
  initial_money = 0,
  self_stat_auto_update_enabled = false,
  relationship_update_interval_turns = null,
  mature_content_mode_enabled = false,
  refusal_detection_enabled = false,
  weather_tag_map = {},
  time_slot_tag_map = {},
  impression_auto_update_enabled = false,
  memory_prompt_limit = 5,
  memory_auto_extract_enabled = false,
  memory_editing_visible = true,
}) {
  const result = db
    .prepare(
      `INSERT INTO worlds
        (name, worldview, is_unassigned_bucket, time_slot_labels, weather_options, season_labels, days_per_season, day_of_week_labels, holiday_weekday_indices, image_style_preset_id, image_tags,
         protagonist_name, protagonist_nickname, protagonist_occupation, protagonist_appearance, protagonist_gender, protagonist_notes, protagonist_mode, attribute_tags,
         movement_points_per_time_slot, max_response_tokens, notify_relationship_changes, status_display_settings,
         currency_enabled, currency_unit, initial_money, self_stat_auto_update_enabled, relationship_update_interval_turns, mature_content_mode_enabled,
         weather_tag_map, time_slot_tag_map, impression_auto_update_enabled, refusal_detection_enabled,
         memory_prompt_limit, memory_auto_extract_enabled, memory_editing_visible)
       VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      worldview ?? '',
      JSON.stringify(time_slot_labels),
      JSON.stringify(weather_options),
      JSON.stringify(season_labels),
      days_per_season,
      JSON.stringify(day_of_week_labels),
      JSON.stringify(holiday_weekday_indices),
      image_style_preset_id,
      image_tags ?? '',
      protagonist_name ?? '',
      protagonist_nickname ?? '',
      protagonist_occupation ?? '',
      protagonist_appearance ?? '',
      protagonist_gender ?? '',
      protagonist_notes ?? '',
      protagonist_mode ?? 'character',
      attribute_tags ?? '',
      movement_points_per_time_slot ?? 4,
      max_response_tokens ?? null,
      notify_relationship_changes ? 1 : 0,
      JSON.stringify(status_display_settings ?? DEFAULT_STATUS_DISPLAY_SETTINGS),
      currency_enabled ? 1 : 0,
      currency_unit ?? '円',
      initial_money ?? 0,
      self_stat_auto_update_enabled ? 1 : 0,
      relationship_update_interval_turns ?? null,
      mature_content_mode_enabled ? 1 : 0,
      JSON.stringify(weather_tag_map ?? {}),
      JSON.stringify(time_slot_tag_map ?? {}),
      impression_auto_update_enabled ? 1 : 0,
      refusal_detection_enabled ? 1 : 0,
      memory_prompt_limit ?? 5,
      memory_auto_extract_enabled ? 1 : 0,
      memory_editing_visible ? 1 : 0,
    );
  return getWorld(result.lastInsertRowid);
}

export function updateWorld(
  id,
  {
    name,
    worldview,
    time_slot_labels,
    weather_options,
    season_labels,
    days_per_season,
    day_of_week_labels,
    holiday_weekday_indices,
    image_style_preset_id,
    image_tags,
    protagonist_name,
    protagonist_nickname,
    protagonist_occupation,
    protagonist_appearance,
    protagonist_gender,
    protagonist_notes,
    protagonist_mode,
    attribute_tags,
    movement_points_per_time_slot,
    max_response_tokens,
    notify_relationship_changes,
    status_display_settings,
    currency_enabled,
    currency_unit,
    initial_money,
    self_stat_auto_update_enabled,
    relationship_update_interval_turns,
    mature_content_mode_enabled,
    weather_tag_map,
    time_slot_tag_map,
    impression_auto_update_enabled,
    refusal_detection_enabled,
    memory_prompt_limit,
    memory_auto_extract_enabled,
    memory_editing_visible,
  },
) {
  db.prepare(
    `UPDATE worlds
     SET name = ?, worldview = ?, time_slot_labels = ?, weather_options = ?, season_labels = ?, days_per_season = ?, day_of_week_labels = ?, holiday_weekday_indices = ?, image_style_preset_id = ?, image_tags = ?,
         protagonist_name = ?, protagonist_nickname = ?, protagonist_occupation = ?, protagonist_appearance = ?, protagonist_gender = ?, protagonist_notes = ?, protagonist_mode = ?,
         attribute_tags = ?, movement_points_per_time_slot = ?, max_response_tokens = ?, notify_relationship_changes = ?, status_display_settings = ?,
         currency_enabled = ?, currency_unit = ?, initial_money = ?, self_stat_auto_update_enabled = ?, relationship_update_interval_turns = ?, mature_content_mode_enabled = ?,
         weather_tag_map = ?, time_slot_tag_map = ?, impression_auto_update_enabled = ?, refusal_detection_enabled = ?,
         memory_prompt_limit = ?, memory_auto_extract_enabled = ?, memory_editing_visible = ?
     WHERE id = ? AND is_unassigned_bucket = 0`,
  ).run(
    name,
    worldview ?? '',
    JSON.stringify(time_slot_labels ?? DEFAULT_TIME_SLOT_LABELS),
    JSON.stringify(weather_options ?? DEFAULT_WEATHER_OPTIONS),
    JSON.stringify(season_labels ?? DEFAULT_SEASON_LABELS),
    days_per_season ?? DEFAULT_DAYS_PER_SEASON,
    JSON.stringify(day_of_week_labels ?? DEFAULT_DAY_OF_WEEK_LABELS),
    JSON.stringify(holiday_weekday_indices ?? DEFAULT_HOLIDAY_WEEKDAY_INDICES),
    image_style_preset_id ?? null,
    image_tags ?? '',
    protagonist_name ?? '',
    protagonist_nickname ?? '',
    protagonist_occupation ?? '',
    protagonist_appearance ?? '',
    protagonist_gender ?? '',
    protagonist_notes ?? '',
    protagonist_mode ?? 'character',
    attribute_tags ?? '',
    movement_points_per_time_slot ?? 4,
    max_response_tokens ?? null,
    notify_relationship_changes ? 1 : 0,
    JSON.stringify(status_display_settings ?? DEFAULT_STATUS_DISPLAY_SETTINGS),
    currency_enabled ? 1 : 0,
    currency_unit ?? '円',
    initial_money ?? 0,
    self_stat_auto_update_enabled ? 1 : 0,
    relationship_update_interval_turns ?? null,
    mature_content_mode_enabled ? 1 : 0,
    JSON.stringify(weather_tag_map ?? {}),
    JSON.stringify(time_slot_tag_map ?? {}),
    impression_auto_update_enabled ? 1 : 0,
    refusal_detection_enabled ? 1 : 0,
    memory_prompt_limit ?? 5,
    memory_auto_extract_enabled ? 1 : 0,
    memory_editing_visible ? 1 : 0,
    id,
  );
  return getWorld(id);
}

export function setThumbnailImage(id, imagePath) {
  db.prepare('UPDATE worlds SET thumbnail_image_path = ? WHERE id = ?').run(imagePath, id);
  return getWorld(id);
}

export function deleteWorld(id) {
  const world = getWorld(id);
  if (!world) return { deleted: false, reason: 'not_found' };
  if (world.is_unassigned_bucket) return { deleted: false, reason: 'unassigned_bucket' };
  db.prepare('DELETE FROM worlds WHERE id = ?').run(id);
  return { deleted: true };
}
