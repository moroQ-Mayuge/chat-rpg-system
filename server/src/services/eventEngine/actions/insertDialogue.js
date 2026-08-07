import { db } from '../../../db/connection.js';
import { createMessage } from '../../../db/repositories/messagesRepo.js';
import { broadcast } from '../../../ws/rooms.js';
import { generateChatCompletion } from '../../koboldClient.js';
import { serializeCharacter } from '../../characterSheetFormat.js';
import { getUndressStateLines } from '../../undressState.js';
import { resolveSingleTargetId } from '../targetResolution.js';
import { resolvePlaceholderText } from '../placeholderResolution.js';
import { withDisambiguatedNames } from '../../participantNaming.js';
import { getTransformation } from '../../../db/repositories/characterTransformationsRepo.js';
import { composeCharacterIdentity } from '../../characterIdentity.js';
import { resolveProtagonist } from '../../../db/repositories/playthroughsRepo.js';

function fallbackEmotionKey() {
  return db.prepare("SELECT llm_tag_key FROM expression_types WHERE name = '通常'").get()?.llm_tag_key ?? 'normal';
}

// Present participants, named, for grounding a generated line -- without
// this the LLM has no idea who's actually in the room and invents generic
// stand-ins ("ママ"/"パパ"/random names from its own training) instead of
// the real characters. Empty when nobody (besides the speaker, if any) is
// present, in which case the line below it is simply omitted.
function presentParticipantsLine(execCtx, excludeCharacterId = null) {
  const names = withDisambiguatedNames(execCtx.session.participants)
    .filter((p) => p.character_id !== excludeCharacterId)
    .map((p) => p.display_name);
  // プレイヤーがキャラクターとしてこの場にいるモードの時だけ加える(不具合報告
  // 2026-08-06項目1)。${player}は指示文中で実名に置換済みなのに、この許可
  // リストにプレイヤーが載っていないと「その名前は許可リストに無い」矛盾に
  // なり、モデルが別の@キャラ名で代用してしまっていた。'narrator'(プレイヤーが
  // キャラでない神/GM視点)の時は本来この場に存在しないので加えない。
  const protagonist = resolveProtagonist(execCtx.playthroughId);
  if (protagonist.mode === 'character') {
    names.push(protagonist.name?.trim() || 'あなた');
  }
  return names.length > 0 ? `この場にいる人物：${names.join('、')}` : '';
}

async function generateCharacterLine(characterId, promptHint, execCtx) {
  const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
  const participant = execCtx.session.participants.find((p) => p.character_id === characterId);
  const outfit = participant?.current_outfit_id
    ? db.prepare('SELECT * FROM outfits WHERE id = ?').get(participant.current_outfit_id)
    : null;
  const transformation = participant?.current_transformation_id ? getTransformation(participant.current_transformation_id) : null;
  const identityCharacter = composeCharacterIdentity(character, transformation);
  const undressStateLines = getUndressStateLines(execCtx.playthroughId, execCtx.sessionId, characterId);

  const systemPrompt = [
    serializeCharacter(identityCharacter, outfit, undressStateLines),
    presentParticipantsLine(execCtx, characterId),
    '',
    'あなたは上記のキャラクターになりきって、日本語で一言だけセリフを発してください。',
    '地の文・タグ・鉤括弧は不要で、セリフ本文のみを出力してください。',
    // ${target1}/${キャラ名} resolve to real participant names (and
    // ${player}/${target1.nickname}/etc. to their respective attributes)
    // here too, same as fixed-mode text -- a hint author can write
    // "${target1}をからかう一言" and have it mean the actual co-present
    // character, not a token the model has never seen.
    `指示：${resolvePlaceholderText(promptHint, execCtx) ?? ''}`,
  ]
    .filter(Boolean)
    .join('\n');

  const rawText = await generateChatCompletion({
    messages: [{ role: 'system', content: systemPrompt }],
    maxTokens: 150,
    temperature: 0.8,
  });
  return rawText.trim();
}

async function generateNarrationLine(promptHint, execCtx) {
  const systemPrompt = [
    '以下の指示に基づいて、短い地の文（ナレーション）を日本語で1文だけ出力してください。タグや見出しは不要です。',
    presentParticipantsLine(execCtx),
    '登場人物の名前は上記の実在の人物名をそのまま使い、架空の名前や関係を作らないでください。',
    `指示：${resolvePlaceholderText(promptHint, execCtx) ?? ''}`,
  ]
    .filter(Boolean)
    .join('\n');
  const rawText = await generateChatCompletion({
    messages: [{ role: 'system', content: systemPrompt }],
    maxTokens: 150,
    temperature: 0.8,
  });
  return rawText.trim();
}

// { mode: "fixed"|"generated", character_id?: number|null|"mentioned"|"condition_matched", text?, prompt_hint?, emotion_tag? }
export async function executeInsertDialogue(params, execCtx) {
  const { mode, text, prompt_hint, emotion_tag } = params;
  const rawCharacterId = params.character_id ?? null;

  // "mentioned"/"condition_matched" are resolved before the null check below
  // so an unresolved mention (nobody @-mentioned this turn) or an
  // unavailable match skips the action outright, instead of silently
  // falling through to the null-means-narration branch.
  let character_id = rawCharacterId;
  if (rawCharacterId === 'mentioned' || rawCharacterId === 'condition_matched') {
    character_id = resolveSingleTargetId(rawCharacterId, execCtx);
    if (character_id == null) return { skipped: true, reason: rawCharacterId === 'mentioned' ? 'no_mention' : 'no_match' };
  }

  if (character_id == null) {
    const content = mode === 'fixed' ? resolvePlaceholderText(text, execCtx) : await generateNarrationLine(prompt_hint, execCtx);
    const message = createMessage(execCtx.sessionId, { sender_type: 'narration', content });
    broadcast(execCtx.sessionId, { type: 'message_complete', message });
    return { inserted: 'narration' };
  }

  const content = mode === 'fixed' ? resolvePlaceholderText(text, execCtx) : await generateCharacterLine(character_id, prompt_hint, execCtx);
  const message = createMessage(execCtx.sessionId, {
    sender_type: 'character',
    character_id,
    content,
    emotion_tag: emotion_tag ?? fallbackEmotionKey(),
  });
  broadcast(execCtx.sessionId, { type: 'message_complete', message });
  return { inserted: 'character', character_id };
}
