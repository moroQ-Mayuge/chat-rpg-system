import { db } from '../../../db/connection.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { character_id: number|"any_present"|"mentioned", outfit_name: string, negate?, mentioned_limit? }
// Matches by outfit *name* (e.g. "水着") rather than outfit_id, since the
// same conceptual outfit exists as a different row per character — matching
// by id would require one condition per character, defeating the point of a
// generic "is anyone in a swimsuit" style check.
export function evaluateHasOutfit(params, ctx) {
  const characterIds =
    params.character_id === 'any_present'
      ? ctx.participants.map((p) => p.character_id)
      : params.character_id === 'mentioned'
        ? resolveMentionedList(ctx.mentionedCharacterIds, params.mentioned_limit)
        : [params.character_id];
  const wearing = characterIds.some((id) => {
    const participant = ctx.participants.find((p) => p.character_id === id);
    if (!participant?.current_outfit_id) return false;
    const outfit = db.prepare('SELECT name FROM outfits WHERE id = ?').get(participant.current_outfit_id);
    return outfit?.name === params.outfit_name;
  });
  return params.negate ? !wearing : wearing;
}
