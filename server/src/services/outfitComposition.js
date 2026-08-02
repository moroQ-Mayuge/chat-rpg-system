import { getCharacterBodyTags } from '../db/repositories/charactersRepo.js';

// PLAN_2026-08-02_outfit_spec_revision.md §4.3/§6 実装順1/2: resolveOutfitTags()
// の呼び出し元全員がここを経由するようにする継ぎ目。将来の段(衣装マスタ参照
// 解決、下着上書き)はこの関数の中身だけを変えればよく、下記の呼び出し元を
// 再び洗い出す必要がない。
//
// 実装順2: 素体タグ(main_features/hairstyle)は衣装側が空ならキャラ本体の値に
// フォールバックする。呼び出し元は既に持っている characterId(= outfit の
// character_id)を渡すだけでよく、キャラ行の取得はこの関数の中に閉じる。
//
// outfit が null/undefined でもそのまま返す — generateImage.js の一部呼び出し
// 元は current_outfit_id が無い参加者を渡すことがあり、その場合は
// resolveOutfitTags 自身の null 早期returnに委ねる。
const BODY_TAG_FIELDS = ['main_features', 'hairstyle'];

export function composeWornOutfit(characterId, outfit) {
  if (!outfit) return outfit;
  const character = characterId != null ? getCharacterBodyTags(characterId) : null;
  if (!character) return outfit;
  const merged = { ...outfit };
  for (const field of BODY_TAG_FIELDS) {
    if (!merged[field]?.trim()) merged[field] = character[field] ?? '';
  }
  return merged;
}
