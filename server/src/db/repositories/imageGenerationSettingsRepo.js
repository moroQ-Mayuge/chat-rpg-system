import { db } from '../connection.js';

export function listImageGenerationSettings() {
  return db.prepare('SELECT * FROM image_generation_settings ORDER BY image_kind ASC').all();
}

export function getImageGenerationSettings(imageKind) {
  return db.prepare('SELECT * FROM image_generation_settings WHERE image_kind = ?').get(imageKind);
}

export function updateImageGenerationSettings(
  imageKind,
  { default_mode, prompt_template, anchor_width, main_width, main_height, steps, cfg_scale, denoising_strength, sampler_name },
) {
  db.prepare(
    `UPDATE image_generation_settings
     SET default_mode = ?, prompt_template = ?, anchor_width = ?, main_width = ?, main_height = ?, steps = ?, cfg_scale = ?, denoising_strength = ?, sampler_name = ?
     WHERE image_kind = ?`,
  ).run(default_mode, prompt_template, anchor_width, main_width, main_height, steps, cfg_scale, denoising_strength, sampler_name, imageKind);
  return getImageGenerationSettings(imageKind);
}
