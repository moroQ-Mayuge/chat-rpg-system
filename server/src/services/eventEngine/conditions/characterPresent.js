import { getCharacter } from '../../../db/repositories/charactersRepo.js';

// { character_id?: number, tag?: string, negate? }
// 特定のキャラ(character_id)、または特定の属性タグ(attribute_tagsの1要素と完全一致)を持つキャラが、
// 今プレイヤーと同じ場所(会話対象)にいるか。両方指定したら、その両方を満たす1人がいる時だけ成立。
// どちらも無ければ不成立。negate=「いない」を成立条件にする。
export function evaluateCharacterPresent(params, ctx) {
  if (params.character_id == null && !params.tag) return false;
  const present = ctx.participants.some((p) => {
    if (params.character_id != null && p.character_id !== params.character_id) return false;
    if (params.tag) {
      const tags = String(getCharacter(p.character_id)?.attribute_tags ?? '')
        .split(',')
        .map((t) => t.trim());
      if (!tags.includes(params.tag)) return false;
    }
    return true;
  });
  return params.negate ? !present : present;
}
