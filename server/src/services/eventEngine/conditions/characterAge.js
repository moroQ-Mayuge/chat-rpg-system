import { getCharacter } from '../../../db/repositories/charactersRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { character_id: number|"any_present"|"mentioned", min_age: number, mentioned_limit? }
// 対象キャラの年齢(characters.age_real)が min_age 以上か。婚約・結婚のように成人限定にしたい
// 汎用イベント(キャラ指定なし、@メンション対象)の年齢ガード用。
// 他の条件(relationship_threshold等)は「対象のうち誰か1人が満たせば成立」だが、これは
// **対象全員が満たした時だけ成立**する——未成年が1人でも対象に混ざったら不成立にして、
// 複数人を@した時に成人側が条件を満たしてしまう抜け道を塞ぐ。
// 年齢が空・数値として読めない場合、対象が0人の場合も不成立(安全側)。
function parseAge(raw) {
  const digits = String(raw ?? '').match(/\d+/)?.[0];
  return digits == null ? null : Number.parseInt(digits, 10);
}

export function evaluateCharacterAge(params, ctx) {
  const { character_id, min_age, mentioned_limit } = params;
  const minAge = Number(min_age);
  if (!Number.isFinite(minAge)) return false;
  const characterIds =
    character_id === 'any_present'
      ? ctx.participants.map((p) => p.character_id)
      : character_id === 'mentioned'
        ? resolveMentionedList(ctx.mentionedCharacterIds, mentioned_limit)
        : character_id == null
          ? []
          : [character_id];
  if (characterIds.length === 0) return false;
  return characterIds.every((id) => {
    const age = parseAge(getCharacter(id)?.age_real);
    return age != null && age >= minAge;
  });
}
