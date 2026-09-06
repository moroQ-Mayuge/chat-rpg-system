import { getStatus } from '../db/repositories/characterStatusesRepo.js';
import { setAutoOutfitImageCheckpoint } from '../db/repositories/roomSessionsRepo.js';
import { countUserTurnsForSession } from '../db/repositories/messagesRepo.js';
import { executeGenerateImage } from './eventEngine/actions/generateImage.js';

// 脱衣コマンド実行時・衣装の着替え時に自動で画像生成する(0125)。新しい生成
// ロジックは作らず、既存のイベントアクションexecuteGenerateImageを
// target_character_ids一人分だけに絞って呼び直す——現在の衣装＋脱衣状態
// (disturbs_outfit_field/suppresses_outfit_fields)がresolveParticipantImageTags
// 経由で正しく反映される。
//
// クールダウン判定＋チェックポイント更新＋画像生成。session/worldは呼び出し元で
// 取得済みのものをそのまま渡す(この関数自身はDB読み直しをしない)。
async function maybeGenerateForCharacter(session, world, characterId) {
  const participant = session.participants.find((p) => p.character_id === characterId);
  if (!participant) return; // 退室済み等

  const turnNumber = countUserTurnsForSession(session.id);
  const elapsed = turnNumber - participant.auto_outfit_image_last_turn;
  if (world.auto_outfit_image_cooldown_turns > 0 && elapsed < world.auto_outfit_image_cooldown_turns) return;

  // 生成前にチェックポイントを進めておく(生成中に別の変化が来ても多重発火しない)。
  setAutoOutfitImageCheckpoint(participant.id, turnNumber);
  try {
    // prompt_overrideを渡さないため、auto_append_unreferenced(既定true)の
    // 「leftover」救済ロジックが働くと、character_tagsがbuildSceneTagParts側の
    // ${character_tags}と二重に載ってしまう(target1のような個別参照を作らない
    // ので、既定のleftover救済は常に「未参照」と誤認する)。ここでは常にfalseに
    // して二重掲載を防ぐ——${character_tags}側だけで足りる。
    await executeGenerateImage(
      { image_type: 'event', target_character_ids: [characterId], auto_append_unreferenced: false },
      { sessionId: session.id, playthroughId: session.playthrough_id, session },
    );
  } catch (err) {
    console.error('auto outfit image generation failed:', err);
  }
}

// 脱衣ラダーのstatus(disturbs_outfit_field/suppresses_outfit_fieldsを持つもの)が
// grant/removeされた時だけ画像生成する——特定のイベントIDに依存させず、対象status
// の性質だけで判定するので、将来追加される脱衣コマンドにも自動で対応する。
// 発情/照れ等、脱衣と無関係なchange_statusでは発火しない。
export async function maybeGenerateImageOnUndress(session, world, fired) {
  if (!world.undress_image_generation_enabled) return;
  const characterIds = new Set();
  for (const event of fired) {
    for (const ar of event.actionResults) {
      if (ar.actionType !== 'change_status') continue;
      for (const change of ar.result?.changes ?? []) {
        if (change.skipped || (change.operation !== 'grant' && change.operation !== 'remove')) continue;
        const status = getStatus(change.status_id);
        if (!status?.disturbs_outfit_field && !status?.suppresses_outfit_fields) continue;
        characterIds.add(change.character_id);
      }
    }
  }
  for (const characterId of characterIds) await maybeGenerateForCharacter(session, world, characterId);
}

// change_outfitイベントアクション経由の着替え。
export async function maybeGenerateImageOnOutfitChangeEvent(session, world, fired) {
  if (!world.outfit_change_image_generation_enabled) return;
  const characterIds = new Set();
  for (const event of fired) {
    for (const ar of event.actionResults) {
      if (ar.actionType !== 'change_outfit' || ar.result?.skipped) continue;
      characterIds.add(ar.result.character_id);
    }
  }
  for (const characterId of characterIds) await maybeGenerateForCharacter(session, world, characterId);
}

// /wear-item・/wear-outfitルート(イベントエンジンを経由しない着替え)から直接呼ぶ。
export async function maybeGenerateImageOnDirectWear(session, world, characterId) {
  if (!world.outfit_change_image_generation_enabled) return;
  await maybeGenerateForCharacter(session, world, characterId);
}
