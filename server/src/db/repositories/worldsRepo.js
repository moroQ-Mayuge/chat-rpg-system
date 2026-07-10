import { db } from '../connection.js';

function parseWorld(row) {
  if (!row) return row;
  return {
    ...row,
    is_unassigned_bucket: Boolean(row.is_unassigned_bucket),
    time_slot_labels: JSON.parse(row.time_slot_labels),
    weather_options: JSON.parse(row.weather_options),
    season_labels: JSON.parse(row.season_labels),
  };
}

export function listWorlds() {
  return db
    .prepare('SELECT * FROM worlds ORDER BY is_unassigned_bucket ASC, name ASC')
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

export function createWorld({
  name,
  worldview,
  time_slot_labels = DEFAULT_TIME_SLOT_LABELS,
  weather_options = DEFAULT_WEATHER_OPTIONS,
  season_labels = DEFAULT_SEASON_LABELS,
  days_per_season = DEFAULT_DAYS_PER_SEASON,
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
}) {
  const result = db
    .prepare(
      `INSERT INTO worlds
        (name, worldview, is_unassigned_bucket, time_slot_labels, weather_options, season_labels, days_per_season, image_style_preset_id, image_tags,
         protagonist_name, protagonist_nickname, protagonist_occupation, protagonist_appearance, protagonist_gender, protagonist_notes, protagonist_mode, attribute_tags,
         movement_points_per_time_slot)
       VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      worldview ?? '',
      JSON.stringify(time_slot_labels),
      JSON.stringify(weather_options),
      JSON.stringify(season_labels),
      days_per_season,
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
  },
) {
  db.prepare(
    `UPDATE worlds
     SET name = ?, worldview = ?, time_slot_labels = ?, weather_options = ?, season_labels = ?, days_per_season = ?, image_style_preset_id = ?, image_tags = ?,
         protagonist_name = ?, protagonist_nickname = ?, protagonist_occupation = ?, protagonist_appearance = ?, protagonist_gender = ?, protagonist_notes = ?, protagonist_mode = ?,
         attribute_tags = ?, movement_points_per_time_slot = ?
     WHERE id = ? AND is_unassigned_bucket = 0`,
  ).run(
    name,
    worldview ?? '',
    JSON.stringify(time_slot_labels ?? DEFAULT_TIME_SLOT_LABELS),
    JSON.stringify(weather_options ?? DEFAULT_WEATHER_OPTIONS),
    JSON.stringify(season_labels ?? DEFAULT_SEASON_LABELS),
    days_per_season ?? DEFAULT_DAYS_PER_SEASON,
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
