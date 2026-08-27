import { db } from '../connection.js';
import { FOREIGN_TOKEN_BANS } from '../../services/llmTokenBans.js';

export function getGenerationSettings() {
  return db.prepare('SELECT * FROM llm_generation_settings WHERE id = 1').get();
}

export function updateGenerationSettings({
  temperature,
  rep_pen,
  rep_pen_range,
  top_p,
  top_k,
  min_p,
  foreign_token_ban_enabled,
}) {
  db.prepare(
    `UPDATE llm_generation_settings
     SET temperature = ?, rep_pen = ?, rep_pen_range = ?, top_p = ?, top_k = ?, min_p = ?, foreign_token_ban_enabled = ?
     WHERE id = 1`,
  ).run(temperature, rep_pen, rep_pen_range, top_p, top_k, min_p, foreign_token_ban_enabled ? 1 : 0);
  return getGenerationSettings();
}

// 日本語出力を期待する呼び出し元(チャット返信・キャラシート生成)が使う。設定が
// OFFならundefinedを返し、koboldClient.jsはbanned_tokensフィールド自体を送らない。
export function resolveForeignTokenBans() {
  return getGenerationSettings()?.foreign_token_ban_enabled ? FOREIGN_TOKEN_BANS : undefined;
}
