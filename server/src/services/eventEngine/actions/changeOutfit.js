import { updateParticipantOutfit } from '../../../db/repositories/roomSessionsRepo.js';
import { broadcast } from '../../../ws/rooms.js';

// { character_id, outfit_id }
export async function executeChangeOutfit(params, execCtx) {
  const { character_id, outfit_id } = params;
  updateParticipantOutfit(execCtx.sessionId, character_id, outfit_id);
  broadcast(execCtx.sessionId, { type: 'participants_changed' });
  return { character_id, outfit_id };
}
