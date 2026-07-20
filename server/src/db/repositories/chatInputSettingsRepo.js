import { db } from '../connection.js';

export function getChatInputSettings() {
  return db.prepare('SELECT * FROM chat_input_settings WHERE id = 1').get();
}

export function updateChatInputSettings({ clear_mentions_on_send }) {
  db.prepare('UPDATE chat_input_settings SET clear_mentions_on_send = ? WHERE id = 1').run(clear_mentions_on_send ? 1 : 0);
  return getChatInputSettings();
}
