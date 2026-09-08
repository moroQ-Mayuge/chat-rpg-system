import { db } from '../../../db/connection.js';
import { removeParticipant } from '../../../db/repositories/roomSessionsRepo.js';
import { createMessage } from '../../../db/repositories/messagesRepo.js';
import { broadcast } from '../../../ws/rooms.js';
import { resolveSingleTargetId } from '../targetResolution.js';

// { selection_mode: "specific"|"random_from_present", character_id?: number|"mentioned"|"condition_matched", exit_narration? }
export async function executeCharacterLeave(params, execCtx) {
  const { selection_mode, character_id, exit_narration } = params;
  const allParticipants = execCtx.session.participants;
  // 同行中のキャラは退出対象から完全に除外する(ランダム選出の候補からも外れ、
  // 指定ID狙い撃ちでも下のnot_present判定に引っかかって弾かれる)。同行を
  // やめさせるには同行解除コマンド(set_accompanyingアクション)を使う。
  const present = allParticipants.filter((p) => !p.is_accompanying).map((p) => p.character_id);

  let targetId = resolveSingleTargetId(character_id, execCtx);
  if (selection_mode === 'random_from_present') {
    if (present.length === 0) return { skipped: true, reason: 'none_present' };
    targetId = present[Math.floor(Math.random() * present.length)];
  }

  if (targetId != null && allParticipants.some((p) => p.character_id === targetId && p.is_accompanying)) {
    return { skipped: true, reason: 'accompanying' };
  }
  if (targetId == null || !present.includes(targetId)) {
    return { skipped: true, reason: targetId == null ? 'no_mention' : 'not_present' };
  }

  // ランダム選出はインスタンスを指定しようがない(character_idだけで選んでいる)ため
  // undefinedのまま。@メンション等で具体的なインスタンスが分かる場合のみ渡す。
  const roomSessionCharacterId = selection_mode === 'random_from_present' ? null : execCtx.instanceHintByCharacterId?.get(targetId) ?? null;
  removeParticipant(execCtx.sessionId, targetId, roomSessionCharacterId);
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
