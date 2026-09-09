import { getCharacter } from '../db/repositories/charactersRepo.js';
import { createMobFlavorPreset } from '../db/repositories/mobFlavorPresetsRepo.js';
import { setParticipantMobFlavorPresetIfUnset } from '../db/repositories/roomSessionsRepo.js';
import { generateCharacterSheet } from './characterAssist.js';
import { broadcast } from '../ws/rooms.js';

// LLM生成モード(worlds.mob_flavor_mode==='llm')用。部屋登場をブロック
// しないよう、呼び出し元(roomSessions.jsルート)がレスポンス送出後にfire-and-forget
// で呼ぶ。childCharacter.jsのgenerateChildDetailsと同じ「指示文＋既存フィールドを
// 渡してgenerateCharacterSheetにシートを1枚生成させ、使う項目だけ抜き出す」パターン。
export async function generateMobFlavorAsync(sessionId, roomSessionCharacterId, mobCharacterId, worldId) {
  try {
    const mob = getCharacter(mobCharacterId);
    if (!mob) return;

    const contextParts = [
      mob.gender && `性別：${mob.gender}`,
      mob.occupation && `職業：${mob.occupation}`,
      mob.race && `種族：${mob.race}`,
      mob.attribute && `属性：${mob.attribute}`,
      mob.attribute_tags && `属性タグ：${mob.attribute_tags}`,
      (mob.age_apparent || mob.age_real) && `年齢：${mob.age_apparent || mob.age_real}歳`,
      mob.notes && `備考：${mob.notes}`,
    ].filter(Boolean);
    const instruction = `その場に居合わせた通行人・モブキャラクター（${contextParts.join('、') || '詳細不明'}）。この人物像にふさわしい名前・性格・口調を考えてください。`;

    const sheet = await generateCharacterSheet(instruction);
    const preset = createMobFlavorPreset({
      world_id: worldId,
      name: sheet.fields.name || mob.name,
      personality: sheet.fields.personality,
      speech_style: sheet.fields.speech_style,
      sentence_ending: sheet.fields.sentence_ending,
      first_person: sheet.fields.first_person,
      call_user_as: sheet.fields.call_user_as,
      call_others_as: sheet.fields.call_others_as,
      is_generated: true,
    });

    const applied = setParticipantMobFlavorPresetIfUnset(roomSessionCharacterId, preset.id);
    if (applied) broadcast(sessionId, { type: 'participants_changed' });
  } catch (err) {
    console.error('mob flavor LLM generation failed:', err);
  }
}

// llmモードのWorldで、まだペルソナが決まっていないモブ参加者(is_mob かつ
// mob_flavor_preset_id未設定)を全員拾い、fire-and-forgetで生成をキックする。
// 部屋セッションを新規作成/切替するルート(セッション作成、/move)がレスポンス
// 送出後に呼ぶ——「未生成のまま残っている行」を毎回拾い直す設計なので、前回
// koboldcppが落ちていて生成できなかった行も次の機会に自然にリトライされる。
export function triggerPendingMobFlavorGeneration(session, world) {
  if (world.mob_flavor_mode !== 'llm') return;
  const pending = (session?.all_participants ?? []).filter((p) => p.is_active && p.is_mob && p.mob_flavor_preset_id == null);
  for (const p of pending) {
    generateMobFlavorAsync(session.id, p.id, p.character_id, world.id).catch((err) =>
      console.error('mob flavor LLM generation failed:', err),
    );
  }
}
