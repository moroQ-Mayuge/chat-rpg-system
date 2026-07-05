import { getFlag, setFlag } from '../../../db/repositories/sessionFlagsRepo.js';

// { flag_key, operation: "set"|"increment"|"decrement"|"toggle", value? }
export async function executeSetFlag(params, execCtx) {
  const { flag_key, operation, value } = params;
  const current = getFlag(execCtx.playthroughId, flag_key)?.flag_value;

  let next;
  if (operation === 'set') {
    next = value;
  } else if (operation === 'increment' || operation === 'decrement') {
    const currentNum = Number(current) || 0;
    const delta = Number(value) || 0;
    next = String(operation === 'increment' ? currentNum + delta : currentNum - delta);
  } else if (operation === 'toggle') {
    next = current === 'true' ? 'false' : 'true';
  } else {
    next = current;
  }

  setFlag(execCtx.playthroughId, flag_key, next, execCtx.turnNumber);
  return { flag_key, value: next };
}
