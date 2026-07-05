import { getValue } from '../../../db/repositories/relationshipStatesRepo.js';

function compare(value, comparison, target) {
  if (comparison === '>=') return value >= target;
  if (comparison === '<=') return value <= target;
  if (comparison === '==') return value === target;
  if (comparison === '>') return value > target;
  if (comparison === '<') return value < target;
  return false;
}

// { character_id: number | "any_present", axis_id, comparison, value }
export function evaluateRelationshipThreshold(params, ctx) {
  const { character_id, axis_id, comparison, value } = params;

  if (character_id === 'any_present') {
    return ctx.participants.some((p) => compare(getValue(ctx.playthroughId, p.character_id, axis_id), comparison, value));
  }

  return compare(getValue(ctx.playthroughId, character_id, axis_id), comparison, value);
}
