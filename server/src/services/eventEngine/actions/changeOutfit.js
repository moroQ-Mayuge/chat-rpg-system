import { updateParticipantOutfit } from '../../../db/repositories/roomSessionsRepo.js';
import { broadcast } from '../../../ws/rooms.js';
import { resolveSingleTargetId } from '../targetResolution.js';

// { character_id: number|"mentioned"|"condition_matched", outfit_id }
export async function executeChangeOutfit(params, execCtx) {
  const { outfit_id } = params;
  const character_id = resolveSingleTargetId(params.character_id, execCtx);
  if (character_id == null) return { skipped: true, reason: 'no_mention' };
  updateParticipantOutfit(execCtx.sessionId, character_id, outfit_id);
  broadcast(execCtx.sessionId, { type: 'participants_changed' });
  return { character_id, outfit_id };
}
