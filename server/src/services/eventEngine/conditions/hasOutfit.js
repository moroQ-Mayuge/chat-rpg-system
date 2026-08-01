import { db } from '../../../db/connection.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { character_id: number|"any_present"|"mentioned", outfit_name: string, negate?, mentioned_limit? }
// Matches by outfit *name* (e.g. "水着") rather than outfit_id, since the
// same conceptual outfit exists as a different row per character — matching
// by id would require one condition per character, defeating the point of a
// generic "is anyone in a swimsuit" style check.
// See flagState.js's matchingCharactersForFlagState for the null-vs-[] contract,
// and hasStatus.js's matchingCharactersForHasStatus for why negate is excluded.
export function matchingCharactersForHasOutfit(params, ctx) {
  if (params.character_id == null) return null;
  const characterIds =
    params.character_id === 'any_present'
      ? ctx.participants.map((p) => p.character_id)
      : params.character_id === 'mentioned'
        ? resolveMentionedList(ctx.mentionedCharacterIds, params.mentioned_limit)
        : [params.character_id];
  return characterIds.filter((id) => {
    const participant = ctx.participants.find((p) => p.character_id === id);
    if (!participant?.current_outfit_id) return false;
    const outfit = db.prepare('SELECT name FROM outfits WHERE id = ?').get(participant.current_outfit_id);
    return outfit?.name === params.outfit_name;
  });
}

export function evaluateHasOutfit(params, ctx) {
  const wearing = matchingCharactersForHasOutfit(params, ctx).length > 0;
  return params.negate ? !wearing : wearing;
}
