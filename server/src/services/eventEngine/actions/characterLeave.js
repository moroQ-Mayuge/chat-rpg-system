import { db } from '../../../db/connection.js';
import { removeParticipant } from '../../../db/repositories/roomSessionsRepo.js';
import { createMessage } from '../../../db/repositories/messagesRepo.js';
import { broadcast } from '../../../ws/rooms.js';
import { resolveMentionedSingle } from '../mentionResolution.js';

// { selection_mode: "specific"|"random_from_present", character_id?: number|"mentioned", exit_narration? }
export async function executeCharacterLeave(params, execCtx) {
  const { selection_mode, character_id, exit_narration } = params;
  const present = execCtx.session.participants.map((p) => p.character_id);

  let targetId = character_id === 'mentioned' ? resolveMentionedSingle(execCtx.mentionedCharacterIds) : character_id;
  if (selection_mode === 'random_from_present') {
    if (present.length === 0) return { skipped: true, reason: 'none_present' };
    targetId = present[Math.floor(Math.random() * present.length)];
  }

  if (targetId == null || !present.includes(targetId)) {
    return { skipped: true, reason: targetId == null ? 'no_mention' : 'not_present' };
  }

  removeParticipant(execCtx.sessionId, targetId);
  broadcast(execCtx.sessionId, { type: 'participants_changed' });

  if (exit_narration) {
    const name = db.prepare('SELECT name FROM characters WHERE id = ?').get(targetId)?.name ?? '???';
    const message = createMessage(execCtx.sessionId, {
      sender_type: 'narration',
      content: exit_narration.replaceAll('{character_name}', name),
    });
    broadcast(execCtx.sessionId, { type: 'message_complete', message });
  }

  return { left: targetId };
}
