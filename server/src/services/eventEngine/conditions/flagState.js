import { getCharacterFlag } from '../../../db/repositories/characterFlagsRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';

// Numeric-looking flag values are compared numerically; otherwise as strings.
function compareFlagValue(current, comparison, value) {
  const exists = current !== undefined && current !== null;

  if (comparison === 'exists') return exists;
  if (comparison === 'not_exists') return !exists;
  if (!exists) return comparison === '!=';

  const currentNum = Number(current);
  const valueNum = Number(value);
  const numeric = !Number.isNaN(currentNum) && !Number.isNaN(valueNum);
  const equal = numeric ? currentNum === valueNum : current === value;

  return comparison === '==' ? equal : !equal;
}

// { flag_key, comparison: "=="|"!="|"exists"|"not_exists", value?,
//   character_id?: number|"any_present"|"mentioned", mentioned_limit?,
//   scope?: "playthrough"|"session" (default "playthrough") }
// character_id unset -> unchanged global session_flags lookup (ctx.flags).
// character_id set -> per-character character_flags lookup, true if ANY
// resolved character satisfies the comparison (mirrors hasStatus.js).
export function evaluateFlagState(params, ctx) {
  const { flag_key, comparison, value, character_id, mentioned_limit, scope = 'playthrough' } = params;

  if (character_id == null) {
    return compareFlagValue(ctx.flags[flag_key], comparison, value);
  }

  const characterIds =
    character_id === 'any_present'
      ? ctx.participants.map((p) => p.character_id)
      : character_id === 'mentioned'
        ? resolveMentionedList(ctx.mentionedCharacterIds, mentioned_limit)
        : [character_id];
  const flagCtx = { playthroughId: ctx.playthroughId, roomSessionId: ctx.session.id };
  return characterIds.some((id) => {
    const row = getCharacterFlag(id, flag_key, scope, flagCtx);
    return compareFlagValue(row?.flag_value, comparison, value);
  });
}
