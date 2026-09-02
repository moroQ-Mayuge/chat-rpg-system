import { updateParticipantOutfit } from '../../../db/repositories/roomSessionsRepo.js';
import { wearMasterAsCharacter } from '../../../db/repositories/outfitMastersRepo.js';
import { getOutfit } from '../../../db/repositories/outfitsRepo.js';
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
  // outfit_id はイベント設定内の生の数値でしかなく、参照先の衣装が後から削除
  // されても検知する仕組みが無い(playthrough_character_outfit.outfit_idの
  // FK制約でしか気づけない)。ここで検証せず突っ込むと、そのFK違反が
  // runEventEngine全体を巻き込んで例外を投げ、そのターンの返信ごと失敗する
  // (実際に踏んだ不具合)。他のアクション(STAT_CHANGE等)の「解決できなければ
  // 黙ってスキップ」という方針に揃え、ここでも安全側に倒す。
  if (resolvedOutfitId != null && !getOutfit(resolvedOutfitId)) {
    return { skipped: true, reason: 'outfit_not_found', outfit_id: resolvedOutfitId };
  }
  updateParticipantOutfit(execCtx.sessionId, character_id, resolvedOutfitId);
  broadcast(execCtx.sessionId, { type: 'participants_changed' });
  return { character_id, outfit_id: resolvedOutfitId };
}
