import { getCharacterBodyTags } from '../db/repositories/charactersRepo.js';
import { getMaster } from '../db/repositories/outfitMastersRepo.js';
import { OUTFIT_TAG_FIELDS } from '../db/repositories/outfitsRepo.js';

// PLAN_2026-08-02_outfit_spec_revision.md §4.3/§6 実装順1/2/4: resolveOutfitTags()
// の呼び出し元全員がここを経由するようにする継ぎ目。将来の段(下着上書き)は
// この関数の中身だけを変えればよく、下記の呼び出し元を再び洗い出す必要がない。
//
// 実装順2: 素体タグ(main_features/hairstyle)は衣装側が空ならキャラ本体の値に
// フォールバックする。呼び出し元は既に持っている characterId(= outfit の
// character_id)を渡すだけでよく、キャラ行の取得はこの関数の中に閉じる。
//
// 実装順4: link_mode='reference' の衣装は自身の19タグ列が空のまま作成される
// (outfitMastersRepo.js の instantiateMasterForCharacter)。読み出し時にここで
// マスタの現在値を解決する — マスタが削除されていれば outfit_master_id は
// ON DELETE SET NULL で自動的にNULLになっているので、素の(空の)衣装列に
// フォールバックするだけで例外は起きない。
//
// outfit が null/undefined でもそのまま返す — generateImage.js の一部呼び出し
// 元は current_outfit_id が無い参加者を渡すことがあり、その場合は
// resolveOutfitTags 自身の null 早期returnに委ねる。
const BODY_TAG_FIELDS = ['main_features', 'hairstyle'];

export function composeWornOutfit(characterId, outfit) {
  if (!outfit) return outfit;
  let effective = outfit;

  if (outfit.link_mode === 'reference' && outfit.outfit_master_id != null) {
    const master = getMaster(outfit.outfit_master_id);
    if (master) {
      effective = { ...outfit };
      for (const field of OUTFIT_TAG_FIELDS) effective[field] = master[field] ?? '';
      effective.garment_operations = master.garment_operations ?? {};
    }
  }

  const character = characterId != null ? getCharacterBodyTags(characterId) : null;
  if (character) {
    if (effective === outfit) effective = { ...outfit };
    for (const field of BODY_TAG_FIELDS) {
      if (!effective[field]?.trim()) effective[field] = character[field] ?? '';
    }
  }

  return effective;
}
