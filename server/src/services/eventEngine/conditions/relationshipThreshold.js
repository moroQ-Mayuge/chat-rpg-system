import { getValue } from '../../../db/repositories/relationshipStatesRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';

function compare(value, comparison, target) {
  if (comparison === '>=') return value >= target;
  if (comparison === '<=') return value <= target;
  if (comparison === '==') return value === target;
  if (comparison === '>') return value > target;
  if (comparison === '<') return value < target;
  return false;
}

// { character_id: number | "any_present" | "mentioned", axis_id, comparison, value, mentioned_limit? }
export function evaluateRelationshipThreshold(params, ctx) {
  const { character_id, axis_id, comparison, value, mentioned_limit } = params;

  if (character_id === 'any_present') {
    return ctx.participants.some((p) => compare(getValue(ctx.playthroughId, p.character_id, axis_id, ctx.session.id), comparison, value));
  }
  if (character_id === 'mentioned') {
    const ids = resolveMentionedList(ctx.mentionedCharacterIds, mentioned_limit);
    return ids.some((id) => compare(getValue(ctx.playthroughId, id, axis_id, ctx.session.id), comparison, value));
  }

  return compare(getValue(ctx.playthroughId, character_id, axis_id, ctx.session.id), comparison, value);
}
