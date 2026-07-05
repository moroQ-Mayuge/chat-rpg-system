import { db } from '../connection.js';

export function listImageFormats() {
  return db.prepare('SELECT * FROM image_format_settings').all();
}

export function getImageFormat(imageKind) {
  return db.prepare('SELECT format FROM image_format_settings WHERE image_kind = ?').get(imageKind)?.format ?? 'png';
}

export function setImageFormat(imageKind, format) {
  db.prepare('UPDATE image_format_settings SET format = ? WHERE image_kind = ?').run(format, imageKind);
  return { image_kind: imageKind, format };
}
