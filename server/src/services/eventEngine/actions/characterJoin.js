import { db } from '../../../db/connection.js';
import { addParticipant } from '../../../db/repositories/roomSessionsRepo.js';
import { createMessage } from '../../../db/repositories/messagesRepo.js';
import { broadcast } from '../../../ws/rooms.js';

function pickWeighted(candidateIds) {
  const weights = candidateIds.map(
    (id) => db.prepare('SELECT event_participation_weight FROM characters WHERE id = ?').get(id)?.event_participation_weight ?? 1,
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < candidateIds.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return candidateIds[i];
  }
  return candidateIds[candidateIds.length - 1];
}

// { selection_mode: "specific"|"random_weighted"|"random_uniform", character_id?, candidate_character_ids?, outfit_id?, entrance_narration? }
export async function executeCharacterJoin(params, execCtx) {
  const { selection_mode, character_id, candidate_character_ids = [], outfit_id = null, entrance_narration } = params;
  const presentIds = new Set(execCtx.session.participants.map((p) => p.character_id));

  let targetId;
  if (selection_mode === 'specific') {
    targetId = character_id;
  } else {
    const pool = candidate_character_ids.filter((id) => !presentIds.has(id));
    if (pool.length === 0) return { skipped: true, reason: 'no_eligible_candidates' };
    targetId = selection_mode === 'random_weighted' ? pickWeighted(pool) : pool[Math.floor(Math.random() * pool.length)];
  }

  if (presentIds.has(targetId)) return { skipped: true, reason: 'already_present' };

  addParticipant(execCtx.sessionId, targetId, outfit_id);
  broadcast(execCtx.sessionId, { type: 'participants_changed' });

  if (entrance_narration) {
    const name = db.prepare('SELECT name FROM characters WHERE id = ?').get(targetId)?.name ?? '???';
    const message = createMessage(execCtx.sessionId, {
      sender_type: 'narration',
      content: entrance_narration.replaceAll('{character_name}', name),
    });
    broadcast(execCtx.sessionId, { type: 'message_complete', message });
  }

  return { joined: targetId };
}
