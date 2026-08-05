import { updateParticipantOutfit } from '../../../db/repositories/roomSessionsRepo.js';
import { wearMasterAsCharacter } from '../../../db/repositories/outfitMastersRepo.js';
import { broadcast } from '../../../ws/rooms.js';
import { resolveSingleTargetId } from '../targetResolution.js';

// { character_id: number|"mentioned"|"condition_matched", outfit_id?, outfit_master_id? }
// outfit_master_id が指定されていればそちらを優先し、実装順6の着用ロジック
// (wearMasterAsCharacter — 既存インスタンスがあれば再利用、無ければ
// link_mode='copy'で新規作成)で対象キャラの衣装インスタンスに解決する。
// 未指定なら従来通り outfit_id をそのまま使う(後方互換)。
export async function executeChangeOutfit(params, execCtx) {
  const { outfit_id, outfit_master_id } = params;
  const character_id = resolveSingleTargetId(params.character_id, execCtx);
  if (character_id == null) return { skipped: true, reason: 'no_mention' };
  const resolvedOutfitId = outfit_master_id != null ? wearMasterAsCharacter(character_id, outfit_master_id).id : outfit_id;
  updateParticipantOutfit(execCtx.sessionId, character_id, resolvedOutfitId);
  broadcast(execCtx.sessionId, { type: 'participants_changed' });
  return { character_id, outfit_id: resolvedOutfitId };
}
