import { updateParticipantOutfit } from '../../../db/repositories/roomSessionsRepo.js';
import { broadcast } from '../../../ws/rooms.js';
import { resolveMentionedSingle } from '../mentionResolution.js';

// { character_id: number|"mentioned", outfit_id }
export async function executeChangeOutfit(params, execCtx) {
  const { outfit_id } = params;
  let { character_id } = params;
  if (character_id === 'mentioned') {
    character_id = resolveMentionedSingle(execCtx.mentionedCharacterIds);
    if (character_id == null) return { skipped: true, reason: 'no_mention' };
  }
  updateParticipantOutfit(execCtx.sessionId, character_id, outfit_id);
  broadcast(execCtx.sessionId, { type: 'participants_changed' });
  return { character_id, outfit_id };
}
