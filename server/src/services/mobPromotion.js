import { db } from '../db/connection.js';
import { getCharacter, createCharacter, CHARACTER_TEXT_FIELDS } from '../db/repositories/charactersRepo.js';
import { attachCharacterToWorld } from '../db/repositories/worldCharactersRepo.js';
import { getMobFlavorPreset } from '../db/repositories/mobFlavorPresetsRepo.js';
import { getOutfit, createOutfit, setExpressionImage } from '../db/repositories/outfitsRepo.js';
import { getValue } from '../db/repositories/relationshipStatesRepo.js';
import { listActiveStatuses, grantStatus } from '../db/repositories/characterStatusStatesRepo.js';
import { getCurrentAddress, setCurrentAddress } from '../db/repositories/characterAddressStatesRepo.js';
import { listImpressionValues, ensureImpressionStatesSeeded } from '../db/repositories/characterImpressionStatesRepo.js';
import {
  getRoomSession,
  ensureRelationshipStatesSeeded,
  repointParticipantCharacter,
} from '../db/repositories/roomSessionsRepo.js';
import { getPlaythrough } from '../db/repositories/playthroughsRepo.js';
import { broadcast } from '../ws/rooms.js';

// ペルソナのうち、モブ本体からではなくプリセットから持ってくる項目
// (mob_flavor_presetsのフィールドと1対1対応)。
const FLAVOR_FIELDS = ['personality', 'speech_style', 'sentence_ending', 'first_person', 'call_user_as', 'call_others_as'];

// 同行中の、ランダムペルソナ付与済みモブを「お気に入りキャラ」として実体化する
// (手動確認、子キャラの「起こす」= materializeChildと同じ構造)。見た目・背景は
// モブ行から継承し、口調・性格系だけプリセットで上書きする。is_mob=falseに
// なることで、以後の関係値・ステータス・記憶は通常キャラと同じくプレイスルー
// 単位で永続する。
export function promoteMobToFavorite(sessionId, roomSessionCharacterId) {
  const session = getRoomSession(sessionId);
  if (!session) return { error: 'session_not_found' };
  const participant = session.all_participants.find((p) => p.id === Number(roomSessionCharacterId));
  if (!participant) return { error: 'participant_not_found' };
  if (participant.mob_flavor_preset_id == null) return { error: 'no_flavor_assigned' };

  const mob = getCharacter(participant.character_id);
  if (!mob?.is_mob) return { error: 'not_a_mob' };
  const preset = getMobFlavorPreset(participant.mob_flavor_preset_id);
  if (!preset) return { error: 'preset_not_found' };

  const playthrough = getPlaythrough(session.playthrough_id);

  // 見た目・背景(容姿・属性タグ・スキル・秘密等)はモブ行からそのまま継承する。
  const inherited = Object.fromEntries(
    CHARACTER_TEXT_FIELDS.filter((f) => f !== 'name' && !FLAVOR_FIELDS.includes(f)).map((f) => [f, mob[f] ?? '']),
  );

  // 各関係性軸(好感度等)・自己ステータス軸(体力等)の現在値(モブ=このインスタンス
  // スコープ)を、新キャラの初期値としてそのまま引き継ぐ。
  const axisIds = db.prepare('SELECT id FROM relationship_axes').all().map((r) => r.id);
  const relationshipDefaults = axisIds.map((axisId) => ({
    relationship_axis_id: axisId,
    initial_value: getValue(playthrough.id, mob.id, axisId, sessionId, roomSessionCharacterId),
  }));

  const impressionDefaults = listImpressionValues(playthrough.id, mob.id, sessionId, roomSessionCharacterId).map((row) => ({
    field_key: row.field_key,
    default_value: row.value,
  }));

  const newCharacter = createCharacter({
    ...inherited,
    // 表示名はプリセット名+「（モブ）」を焼き込む(以後これが本人の正式な名前)。
    name: `${preset.name}（モブ）`,
    personality: preset.personality,
    speech_style: preset.speech_style,
    sentence_ending: preset.sentence_ending,
    first_person: preset.first_person,
    call_user_as: preset.call_user_as,
    call_others_as: preset.call_others_as,
    is_mob: false,
    origin_playthrough_id: playthrough.id,
    is_auto_created: true,
    is_promoted_mob: true,
    relationship_defaults: relationshipDefaults,
    impression_defaults: impressionDefaults,
  });

  attachCharacterToWorld(playthrough.world_id, newCharacter.id);

  // 現在着ている衣装を新キャラ専属として複製する("見た目はそのままに"、以後は
  // モブの共有マスタ衣装から独立して所有する)。
  if (participant.current_outfit_id) {
    const oldOutfit = getOutfit(participant.current_outfit_id);
    if (oldOutfit) {
      const newOutfit = createOutfit(newCharacter.id, { ...oldOutfit, is_default: true });
      for (const img of oldOutfit.expression_images ?? []) {
        setExpressionImage(newOutfit.id, img.expression_type_id, img.image_path);
      }
      db.prepare('UPDATE room_session_characters SET current_outfit_id = ? WHERE id = ?').run(newOutfit.id, roomSessionCharacterId);
    }
  }

  // モブスコープで付与されていたキャラ状態・呼び方を、プレイスルー単位の状態として
  // 新キャラに引き継ぐ(is_mob=falseになった新キャラへのgrantStatus/setCurrentAddress
  // は自動的にそちらへ書かれる)。
  const activeStatuses = listActiveStatuses(mob.id, { playthroughId: playthrough.id, roomSessionId: sessionId, roomSessionCharacterId });
  for (const s of activeStatuses) {
    grantStatus(newCharacter.id, s.status_id, { playthroughId: playthrough.id, roomSessionId: sessionId }, Boolean(s.locked));
  }
  const currentAddress = getCurrentAddress(playthrough.id, mob.id, sessionId, roomSessionCharacterId);
  if (currentAddress) setCurrentAddress(playthrough.id, newCharacter.id, currentAddress, sessionId, null);

  // この参加インスタンスを以後、新キャラ扱いに切り替える。
  repointParticipantCharacter(roomSessionCharacterId, newCharacter.id);
  ensureRelationshipStatesSeeded(playthrough.id, newCharacter.id, sessionId, roomSessionCharacterId);
  ensureImpressionStatesSeeded(playthrough.id, newCharacter.id, sessionId, roomSessionCharacterId);

  broadcast(sessionId, { type: 'participants_changed' });
  return { character: newCharacter };
}
