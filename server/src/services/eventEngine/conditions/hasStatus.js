import { hasStatus as checkHasStatus } from '../../../db/repositories/characterStatusStatesRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { character_id: number|"any_present"|"mentioned", status_id, negate?, mentioned_limit? }
export function evaluateHasStatus(params, ctx) {
  const characterIds =
    params.character_id === 'any_present'
      ? ctx.participants.map((p) => p.character_id)
      : params.character_id === 'mentioned'
        ? resolveMentionedList(ctx.mentionedCharacterIds, params.mentioned_limit)
        : [params.character_id];
  const statusCtx = { playthroughId: ctx.playthroughId, roomSessionId: ctx.session.id };
  const held = characterIds.some((id) => checkHasStatus(id, params.status_id, statusCtx));
  return params.negate ? !held : held;
}
