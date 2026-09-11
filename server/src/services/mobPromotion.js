import { db } from '../db/connection.js';
import { getCharacter, createCharacter, CHARACTER_TEXT_FIELDS } from '../db/repositories/charactersRepo.js';
import { attachCharacterToWorld } from '../db/repositories/worldCharactersRepo.js';
import { getMobFlavorPreset } from '../db/repositories/mobFlavorPresetsRepo.js';
import { getMobNamePreset } from '../db/repositories/mobNamePresetsRepo.js';
import { getMobSurnamePreset } from '../db/repositories/mobSurnamePresetsRepo.js';
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
import { generateMobFlavorAsync } from './mobPersonaGeneration.js';

// ペルソナのうち、モブ本体からではなくプリセットから持ってくる項目
// (mob_flavor_presetsのフィールドと1対1対応)。
const FLAVOR_FIELDS = ['personality', 'speech_style', 'sentence_ending', 'first_person', 'call_user_as', 'call_others_as'];

// 同行中の、ランダムペルソナ付与済みモブを「お気に入りキャラ」として実体化する。
// 見た目・背景はモブ行から継承し、口調・性格系だけプリセットで上書きする。
// is_mob=falseになることで、以後の関係値・ステータス・記憶は通常キャラと同じく
// プレイスルー単位で永続する。
//
// options.allowWithoutPreset: trueの場合、ペルソナ・名前が両方とも未割当
// (プール枠が空/llm生成失敗)でもエラーにせず、モブ自身のname/personality/
// speech_style等をそのまま使って実体化する(「ペルソナ無しで実体化」、
// promoteAccompanyingFlavoredMobsからの自動昇格が使う——同行キャラを引き継ぐ
// 以上、確実にどちらかの形で実体化させたいため)。手動呼び出し(将来のデバッグ
// 用途等)は既定どおりどちらか一方の割当を必須とする。
// ペルソナ(mob_flavor_preset_id)・下の名前(mob_flavor_name_id)・苗字
// (mob_flavor_surname_id、0130)はそれぞれ独立プールに分かれているため(0129/
// 0130)、個別に「割当済みならそれを使う、無ければモブ自身の値にフォールバック
// する」——名前だけ付いていてペルソナは元のモブのまま、苗字は無く下の名前だけ、
// といった組み合わせも成立する。
export function promoteMobToFavorite(sessionId, roomSessionCharacterId, options = {}) {
  const { allowWithoutPreset = false } = options;
  const session = getRoomSession(sessionId);
  if (!session) return { error: 'session_not_found' };
  const participant = session.all_participants.find((p) => p.id === Number(roomSessionCharacterId));
  if (!participant) return { error: 'participant_not_found' };
  if (
    participant.mob_flavor_preset_id == null &&
    participant.mob_flavor_name_id == null &&
    participant.mob_flavor_surname_id == null &&
    !allowWithoutPreset
  ) {
    return { error: 'no_flavor_assigned' };
  }

  const mob = getCharacter(participant.character_id);
  if (!mob?.is_mob) return { error: 'not_a_mob' };
  const preset = participant.mob_flavor_preset_id != null ? getMobFlavorPreset(participant.mob_flavor_preset_id) : null;
  if (participant.mob_flavor_preset_id != null && !preset) return { error: 'preset_not_found' };
  const namePreset = participant.mob_flavor_name_id != null ? getMobNamePreset(participant.mob_flavor_name_id) : null;
  if (participant.mob_flavor_name_id != null && !namePreset) return { error: 'name_preset_not_found' };
  const surnamePreset = participant.mob_flavor_surname_id != null ? getMobSurnamePreset(participant.mob_flavor_surname_id) : null;
  if (participant.mob_flavor_surname_id != null && !surnamePreset) return { error: 'surname_preset_not_found' };

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

  // ペルソナが無い場合(preset枠が空・llm生成失敗)は元のモブ自身の性格・口調を、
  // それぞれ独立にフォールバックする——「ペルソナ無しで実体化」。名前は
  // 苗字(surnamePreset)・下の名前(namePreset)がそれぞれ独立に割当済みならそれを
  // 使い、両方とも無い場合だけ元のモブ自身の名前にフォールバックする(0130)。
  const flavorSource = preset ?? mob;
  const fullNamePreset = [surnamePreset?.surname, namePreset?.name].filter(Boolean).join(' ');
  const baseName = fullNamePreset || mob.name;

  const newCharacter = createCharacter({
    ...inherited,
    // 表示名は(名前プリセット名 or 元のモブ名)+「（モブ）」を焼き込む(以後
    // これが本人の正式な名前)。
    name: `${baseName}（モブ）`,
    personality: flavorSource.personality,
    speech_style: flavorSource.speech_style,
    sentence_ending: flavorSource.sentence_ending,
    first_person: flavorSource.first_person,
    call_user_as: flavorSource.call_user_as,
    call_others_as: flavorSource.call_others_as,
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

// 同行キャラが次のセッション/部屋へ引き継がれる全経路(継続セッションの部屋移動・
// 区切り再開・end_session/force_room_transferイベント)で、その直前に呼ぶ。
// 「連れ出して部屋移動した時点でキャラ情報をプールする」— 手動のお気に入り
// 登録ボタンに代わる自動昇格。world.mob_flavor_mode==='off'なら何もしない
// (そもそもモブはis_accompanying=trueになれない、setAccompanying.js参照)。
//
// llmモードでまだペルソナ未生成のモブは、ここで同期的に生成を待ってから
// 昇格する(移動そのものは待たせるが、koboldcpp不通等で生成に失敗しても
// promoteMobToFavoriteのallowWithoutPresetにより元のモブ名+性格のまま
// 実体化する——同行キャラが消えることは無い)。
//
// 戻り値: 呼び出し元が保持していたsessionオブジェクトは古くなる(character_id
// が変わるため)——常にこの関数の戻り値(再取得したsession)を使うこと。
export async function promoteAccompanyingFlavoredMobs(session, world) {
  if (world.mob_flavor_mode === 'off') return session;
  const targets = session.participants.filter((p) => p.is_active && p.is_accompanying && p.is_mob);
  if (targets.length === 0) return session;

  for (const p of targets) {
    if (p.mob_flavor_preset_id == null && world.mob_flavor_mode === 'llm') {
      await generateMobFlavorAsync(session.id, p.id, p.character_id, world.id);
    }
  }
  for (const p of targets) {
    promoteMobToFavorite(session.id, p.id, { allowWithoutPreset: true });
  }
  return getRoomSession(session.id);
}
