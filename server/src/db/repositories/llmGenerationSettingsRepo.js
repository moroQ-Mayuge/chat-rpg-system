import { db } from '../connection.js';
import { JAPANESE_ENGLISH_GRAMMAR } from '../../services/llmGrammar.js';

export function getGenerationSettings() {
  return db.prepare('SELECT * FROM llm_generation_settings WHERE id = 1').get();
}

export function updateGenerationSettings({ temperature, rep_pen, rep_pen_range, top_p, top_k, min_p, grammar_enabled }) {
  db.prepare(
    `UPDATE llm_generation_settings
     SET temperature = ?, rep_pen = ?, rep_pen_range = ?, top_p = ?, top_k = ?, min_p = ?, grammar_enabled = ?
     WHERE id = 1`,
  ).run(temperature, rep_pen, rep_pen_range, top_p, top_k, min_p, grammar_enabled ? 1 : 0);
  return getGenerationSettings();
}

// 日本語出力を期待する呼び出し元(チャット返信・キャラシート生成)が使う。設定が
// OFFならundefinedを返し、koboldClient.jsはgrammarフィールド自体を送らない。
export function resolveJapaneseGrammar() {
  return getGenerationSettings()?.grammar_enabled ? JAPANESE_ENGLISH_GRAMMAR : undefined;
}
