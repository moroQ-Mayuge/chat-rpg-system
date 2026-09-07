import { setAccompanying } from '../../../db/repositories/roomSessionsRepo.js';
import { resolveSingleTargetId } from '../targetResolution.js';

// { character_id: number|"mentioned"|"condition_matched", is_accompanying: boolean }
export async function executeSetAccompanying(params, execCtx) {
  const { character_id, is_accompanying } = params;
  const targetId = resolveSingleTargetId(character_id, execCtx);
  if (targetId == null) return { skipped: true, reason: 'no_target' };
  setAccompanying(execCtx.sessionId, targetId, Boolean(is_accompanying));
  return { character_id: targetId, is_accompanying: Boolean(is_accompanying) };
}
