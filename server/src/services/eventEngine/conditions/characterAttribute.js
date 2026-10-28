import { getCharacter } from '../../../db/repositories/charactersRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { character_id: number|"any_present"|"mentioned", tag?, is_mob?: "yes"|"no", gender?, occupation_contains?,
//   quantifier?: "any"|"all", mentioned_limit?, negate? }
// キャラの種類で絞る(キャラを指定しない汎用イベント向け)。指定した条件は1キャラの中で全て満たす必要がある
// (AND)。tag は attribute_tags(カンマ区切り)の1要素と完全一致、gender は完全一致、occupation_contains は
// 部分一致。quantifier は対象が複数の時の扱いで、any(既定)=誰か1人が満たせば成立、all=全員が満たした時だけ
// 成立(対象が0人なら不成立)。何も条件を指定しなければ不成立。
function splitTags(raw) {
  return String(raw ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function characterMatches(character, params) {
  if (!character) return false;
  const specified = [params.tag, params.is_mob, params.gender, params.occupation_contains].some((v) => v != null && v !== '');
  if (!specified) return false;
  if (params.tag && !splitTags(character.attribute_tags).includes(params.tag)) return false;
  if (params.is_mob === 'yes' && !character.is_mob) return false;
  if (params.is_mob === 'no' && character.is_mob) return false;
  if (params.gender && character.gender !== params.gender) return false;
  if (params.occupation_contains && !String(character.occupation ?? '').includes(params.occupation_contains)) return false;
  return true;
}

function resolveTargets(params, ctx) {
  if (params.character_id == null) return [];
  if (params.character_id === 'any_present') return ctx.participants.map((p) => p.character_id);
  if (params.character_id === 'mentioned') return resolveMentionedList(ctx.mentionedCharacterIds, params.mentioned_limit);
  return [params.character_id];
}

export function matchingCharactersForCharacterAttribute(params, ctx) {
  if (params.character_id == null) return null;
  return resolveTargets(params, ctx).filter((id) => characterMatches(getCharacter(id), params));
}

export function evaluateCharacterAttribute(params, ctx) {
  const targets = resolveTargets(params, ctx);
  const matched = matchingCharactersForCharacterAttribute(params, ctx) ?? [];
  const ok = params.quantifier === 'all' ? targets.length > 0 && matched.length === targets.length : matched.length > 0;
  return params.negate ? !ok : ok;
}
