import { CHARACTER_TRANSFORMATION_FIELDS } from '../db/repositories/characterTransformationsRepo.js';

// PLAN_2026-08-02_outfit_spec_revision.md系の追加要望2 実装順1: composeWornOutfit
// と同じ思想の合成層。変身インスタンスが指定されていれば、空でないフィールド
// だけキャラ本体を上書きし、フラットな1個のキャラオブジェクトを返す。
// 呼び出し側は変身の有無を意識しない。
export function composeCharacterIdentity(character, transformation) {
  if (!character || !transformation) return character;
  const overridden = { ...character };
  for (const field of CHARACTER_TRANSFORMATION_FIELDS) {
    if (transformation[field]) overridden[field] = transformation[field];
  }
  return overridden;
}
