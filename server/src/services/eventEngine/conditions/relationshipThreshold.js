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
// character_id is required here (unlike flag_state), so this is always
// character-scoped -- returns the matching id array directly, never null.
// See flagState.js's matchingCharactersForFlagState for the general contract.
export function matchingCharactersForRelationshipThreshold(params, ctx) {
  const { character_id, axis_id, comparison, value, mentioned_limit } = params;
  const characterIds =
    character_id === 'any_present'
      ? ctx.participants.map((p) => p.character_id)
      : character_id === 'mentioned'
        ? resolveMentionedList(ctx.mentionedCharacterIds, mentioned_limit)
        : [character_id];
  return characterIds.filter((id) => compare(getValue(ctx.playthroughId, id, axis_id, ctx.session.id), comparison, value));
}

export function evaluateRelationshipThreshold(params, ctx) {
  return matchingCharactersForRelationshipThreshold(params, ctx).length > 0;
}
