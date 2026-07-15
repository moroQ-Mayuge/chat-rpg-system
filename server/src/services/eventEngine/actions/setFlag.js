import { getFlag, setFlag } from '../../../db/repositories/sessionFlagsRepo.js';
import { getCharacterFlag, setCharacterFlag } from '../../../db/repositories/characterFlagsRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';

function computeNextValue(operation, current, value) {
  if (operation === 'set') return value;
  if (operation === 'increment' || operation === 'decrement') {
    const currentNum = Number(current) || 0;
    const delta = Number(value) || 0;
    return String(operation === 'increment' ? currentNum + delta : currentNum - delta);
  }
  if (operation === 'toggle') return current === 'true' ? 'false' : 'true';
  return current;
}

// { flag_key, operation: "set"|"increment"|"decrement"|"toggle", value?,
//   character_id?: number|"all_present"|"mentioned", mentioned_limit?,
//   scope?: "playthrough"|"session" (default "playthrough") }
// character_id unset -> unchanged global session_flags write.
// character_id set -> per-character character_flags write, applied to every
// resolved character (mirrors changeStatus.js).
export async function executeSetFlag(params, execCtx) {
  const { flag_key, operation, value, character_id, mentioned_limit, scope = 'playthrough' } = params;

  if (character_id == null) {
    const current = getFlag(execCtx.playthroughId, flag_key)?.flag_value;
    const next = computeNextValue(operation, current, value);
    setFlag(execCtx.playthroughId, flag_key, next, execCtx.turnNumber);
    return { flag_key, value: next };
  }

  const targetIds =
    character_id === 'all_present'
      ? execCtx.session.participants.map((p) => p.character_id)
      : character_id === 'mentioned'
        ? resolveMentionedList(execCtx.mentionedCharacterIds, mentioned_limit)
        : [character_id];
  const flagCtx = { playthroughId: execCtx.playthroughId, roomSessionId: execCtx.sessionId };
  const changes = targetIds.map((id) => {
    const current = getCharacterFlag(id, flag_key, scope, flagCtx)?.flag_value;
    const next = computeNextValue(operation, current, value);
    setCharacterFlag(id, flag_key, scope, flagCtx, next, execCtx.turnNumber);
    return { character_id: id, flag_key, value: next };
  });
  return { changes };
}
