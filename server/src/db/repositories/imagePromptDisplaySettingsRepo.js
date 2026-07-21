import { db } from '../connection.js';

export function getImagePromptDisplaySettings() {
  return db.prepare('SELECT * FROM image_prompt_display_settings WHERE id = 1').get();
}

export function updateImagePromptDisplaySettings({ show_image_generation_prompt }) {
  db.prepare('UPDATE image_prompt_display_settings SET show_image_generation_prompt = ? WHERE id = 1').run(
    show_image_generation_prompt ? 1 : 0,
  );
  return getImagePromptDisplaySettings();
}
