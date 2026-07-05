import { db } from '../connection.js';

export function listStylePresets() {
  return db.prepare('SELECT * FROM image_style_presets ORDER BY is_default DESC, id ASC').all();
}

export function getStylePreset(id) {
  return db.prepare('SELECT * FROM image_style_presets WHERE id = ?').get(id);
}

export function getDefaultStylePreset() {
  return db.prepare('SELECT * FROM image_style_presets WHERE is_default = 1').get();
}

function unsetOtherDefaults(exceptId) {
  db.prepare('UPDATE image_style_presets SET is_default = 0 WHERE id != ?').run(exceptId ?? -1);
}

export function createStylePreset({ name, prompt_text, is_default }) {
  const result = db
    .prepare('INSERT INTO image_style_presets (name, prompt_text, is_default) VALUES (?, ?, ?)')
    .run(name, prompt_text ?? '', is_default ? 1 : 0);
  if (is_default) unsetOtherDefaults(result.lastInsertRowid);
  return getStylePreset(result.lastInsertRowid);
}

export function updateStylePreset(id, { name, prompt_text, is_default }) {
  db.prepare('UPDATE image_style_presets SET name = ?, prompt_text = ?, is_default = ? WHERE id = ?').run(
    name,
    prompt_text ?? '',
    is_default ? 1 : 0,
    id,
  );
  if (is_default) unsetOtherDefaults(id);
  return getStylePreset(id);
}

export function deleteStylePreset(id) {
  const preset = getStylePreset(id);
  if (preset?.is_default) {
    throw new Error('デフォルトのスタイルプリセットは削除できません');
  }
  db.prepare('DELETE FROM image_style_presets WHERE id = ?').run(id);
  return { deleted: true };
}

// Resolves the style prompt text to prepend for a room's World: the World's
// own preset if it picked one, otherwise whichever preset is_default.
export function resolveStylePromptForWorld(worldId) {
  const world = db.prepare('SELECT image_style_preset_id FROM worlds WHERE id = ?').get(worldId);
  const preset = world?.image_style_preset_id ? getStylePreset(world.image_style_preset_id) : getDefaultStylePreset();
  return preset?.prompt_text ?? '';
}

// Used where there's no World in scope (Outfit standing/expression image
// generation is a character-level asset, not tied to any particular World).
export function resolveDefaultStylePrompt() {
  return getDefaultStylePreset()?.prompt_text ?? '';
}
