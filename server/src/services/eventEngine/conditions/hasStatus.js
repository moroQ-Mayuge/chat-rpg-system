import { hasStatus as checkHasStatus } from '../../../db/repositories/characterStatusStatesRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { character_id: number|"any_present"|"mentioned", status_id, negate?, mentioned_limit? }
// See flagState.js's matchingCharactersForFlagState for what null vs [] means.
// negate isn't reflected here -- a negated condition is inherently "everyone
// who DOESN'T hold the status", which per_character_firing has no sane way to
// iterate (it's a statement about absence, not a specific character), so
// eventEngine/index.js only consults this for non-negated conditions.
export function matchingCharactersForHasStatus(params, ctx) {
  if (params.character_id == null) return null;
  const characterIds =
    params.character_id === 'any_present'
      ? ctx.participants.map((p) => p.character_id)
      : params.character_id === 'mentioned'
        ? resolveMentionedList(ctx.mentionedCharacterIds, params.mentioned_limit)
        : [params.character_id];
  const statusCtx = { playthroughId: ctx.playthroughId, roomSessionId: ctx.session.id };
  return characterIds.filter((id) => checkHasStatus(id, params.status_id, statusCtx));
}

export function evaluateHasStatus(params, ctx) {
  const held = matchingCharactersForHasStatus(params, ctx).length > 0;
  return params.negate ? !held : held;
}
