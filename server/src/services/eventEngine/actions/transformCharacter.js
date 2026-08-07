import { updateParticipantTransformation } from '../../../db/repositories/roomSessionsRepo.js';
import { getTransformation } from '../../../db/repositories/characterTransformationsRepo.js';
import { broadcast } from '../../../ws/rooms.js';
import { resolveSingleTargetId } from '../targetResolution.js';

// { character_id: number|"mentioned"|"condition_matched", transformation_id: number|null }
// transformation_id が null なら変身解除(素のキャラに戻す)。character_transformations
// は outfit_masters と違い character_id 必須の1キャラ専用なので、解決した対象キャラの
// ものでない変身定義を指していたら安全に無視する(例外は投げない)。
export async function executeTransformCharacter(params, execCtx) {
  const { transformation_id } = params;
  const character_id = resolveSingleTargetId(params.character_id, execCtx);
  if (character_id == null) return { skipped: true, reason: 'no_mention' };
  if (transformation_id != null) {
    const transformation = getTransformation(transformation_id);
    if (!transformation || transformation.character_id !== character_id) {
      return { skipped: true, reason: 'transformation_not_owned' };
    }
  }
  updateParticipantTransformation(execCtx.sessionId, character_id, transformation_id);
  broadcast(execCtx.sessionId, { type: 'participants_changed' });
  return { character_id, transformation_id };
}
