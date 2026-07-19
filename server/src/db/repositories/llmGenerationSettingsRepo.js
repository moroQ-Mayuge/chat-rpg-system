import { db } from '../connection.js';

export function getGenerationSettings() {
  return db.prepare('SELECT * FROM llm_generation_settings WHERE id = 1').get();
}

export function updateGenerationSettings({ temperature, rep_pen, rep_pen_range, top_p, top_k, min_p }) {
  db.prepare(
    `UPDATE llm_generation_settings
     SET temperature = ?, rep_pen = ?, rep_pen_range = ?, top_p = ?, top_k = ?, min_p = ?
     WHERE id = 1`,
  ).run(temperature, rep_pen, rep_pen_range, top_p, top_k, min_p);
  return getGenerationSettings();
}
