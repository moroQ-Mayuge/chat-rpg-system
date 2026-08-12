import { updateParticipantPose } from '../../../db/repositories/roomSessionsRepo.js';
import { broadcast } from '../../../ws/rooms.js';
import { resolveSingleTargetId } from '../targetResolution.js';

// { character_id: number|"mentioned"|"condition_matched", pose_id: number|null }
// pose_id が null なら解除（ポーズ指定なしに戻す）。
export async function executeSetPose(params, execCtx) {
  const { pose_id } = params;
  const character_id = resolveSingleTargetId(params.character_id, execCtx);
  if (character_id == null) return { skipped: true, reason: 'no_mention' };
  updateParticipantPose(execCtx.sessionId, character_id, pose_id ?? null);
  broadcast(execCtx.sessionId, { type: 'participants_changed' });
  return { character_id, pose_id: pose_id ?? null };
}
