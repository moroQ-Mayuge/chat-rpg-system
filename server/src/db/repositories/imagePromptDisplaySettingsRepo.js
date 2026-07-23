import { db } from '../connection.js';

export function getImagePromptDisplaySettings() {
  const row = db.prepare('SELECT * FROM image_prompt_display_settings WHERE id = 1').get();
  // SQLite returns 0/1, not a JS boolean -- without this, ChatPage.jsx's
  // `settings?.show_image_generation_prompt && m.prompt && (...)` JSX
  // short-circuits to the number 0 (not false) when off, and React renders
  // that as literal "0" text (unlike false/null/undefined, which render
  // nothing).
  return { ...row, show_image_generation_prompt: Boolean(row.show_image_generation_prompt) };
}

export function updateImagePromptDisplaySettings({ show_image_generation_prompt }) {
  db.prepare('UPDATE image_prompt_display_settings SET show_image_generation_prompt = ? WHERE id = 1').run(
    show_image_generation_prompt ? 1 : 0,
  );
  return getImagePromptDisplaySettings();
}
