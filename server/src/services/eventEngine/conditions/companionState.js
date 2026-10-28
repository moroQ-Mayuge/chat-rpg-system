import { resolveMentionedList } from '../mentionResolution.js';

// { character_id: number|"any_present"|"mentioned", state: "accompanying"|"dating"|"not_accompanying",
//   mentioned_limit?, negate? }
// 同行(is_accompanying)・デート中(is_dating、同行を含む)の状態を見る。対象は「今この部屋に
// 在籍しているキャラ」(サブ部屋で待機中の同行者も含む)。"not_accompanying" は同行していない
// 在籍キャラ。対象のうち誰か1人でも該当すれば成立(他の条件と同じ)。
// 在籍していないキャラは不該当。negateの扱いは hasStatus.js と同じ(per_character_firingでは対象外)。
function stateOf(row, state) {
  if (state === 'dating') return Boolean(row.is_dating);
  if (state === 'not_accompanying') return !row.is_accompanying;
  return Boolean(row.is_accompanying);
}

export function matchingCharactersForCompanionState(params, ctx) {
  if (params.character_id == null) return null;
  const roster = ctx.session?.active_participants ?? ctx.participants;
  const characterIds =
    params.character_id === 'any_present'
      ? roster.map((p) => p.character_id)
      : params.character_id === 'mentioned'
        ? resolveMentionedList(ctx.mentionedCharacterIds, params.mentioned_limit)
        : [params.character_id];
  return characterIds.filter((id) => {
    const row = roster.find((p) => p.character_id === id);
    return row ? stateOf(row, params.state) : false;
  });
}

export function evaluateCompanionState(params, ctx) {
  const matched = (matchingCharactersForCompanionState(params, ctx) ?? []).length > 0;
  return params.negate ? !matched : matched;
}
