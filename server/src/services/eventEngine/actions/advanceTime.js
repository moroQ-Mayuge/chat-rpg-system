import { advanceTime } from '../../../db/repositories/playthroughsRepo.js';

// { slots?: number } — advances the playthrough owning the room session that
// fired this event, repeating the "advance one time slot" step per slot
// (day rollover / weather reroll / season recompute each apply per SPEC.md 3.2).
export async function executeAdvanceTime(params, execCtx) {
  const { slots = 1 } = params;
  const playthrough = advanceTime(execCtx.playthroughId, slots);
  return { playthrough };
}
