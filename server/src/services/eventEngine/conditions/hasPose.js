import { resolveMentionedList } from '../mentionResolution.js';

// { character_id: number|"any_present"|"mentioned", pose_id: number, negate?, mentioned_limit? }
// Unlike hasOutfit.js (which matches by name, since the same conceptual
// outfit is a different row per character), pose_masters is a single shared
// table, so matching by id directly is correct and simpler.
export function matchingCharactersForHasPose(params, ctx) {
  if (params.character_id == null) return null;
  const characterIds =
    params.character_id === 'any_present'
      ? ctx.participants.map((p) => p.character_id)
      : params.character_id === 'mentioned'
        ? resolveMentionedList(ctx.mentionedCharacterIds, params.mentioned_limit)
        : [params.character_id];
  return characterIds.filter((id) => {
    const participant = ctx.participants.find((p) => p.character_id === id);
    return participant?.current_pose_id === params.pose_id;
  });
}

export function evaluateHasPose(params, ctx) {
  const posed = matchingCharactersForHasPose(params, ctx).length > 0;
  return params.negate ? !posed : posed;
}
