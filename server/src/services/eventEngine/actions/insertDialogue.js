import { db } from '../../../db/connection.js';
import { createMessage } from '../../../db/repositories/messagesRepo.js';
import { broadcast } from '../../../ws/rooms.js';
import { generateChatCompletion } from '../../koboldClient.js';
import { serializeCharacter } from '../../characterSheetFormat.js';
import { getUndressStateLines } from '../../undressState.js';
import { resolveMentionedList } from '../mentionResolution.js';
import { resolveSingleTargetId } from '../targetResolution.js';
import { resolveTargetToken, buildParticipantsByName } from '../placeholderResolution.js';

function fallbackEmotionKey() {
  return db.prepare("SELECT llm_tag_key FROM expression_types WHERE name = '通常'").get()?.llm_tag_key ?? 'normal';
}

// Present participants, named, for grounding a generated line -- without
// this the LLM has no idea who's actually in the room and invents generic
// stand-ins ("ママ"/"パパ"/random names from its own training) instead of
// the real characters. Empty when nobody (besides the speaker, if any) is
// present, in which case the line below it is simply omitted.
function presentParticipantsLine(execCtx, excludeCharacterId = null) {
  const names = execCtx.session.participants
    .filter((p) => p.character_id !== excludeCharacterId)
    .map((p) => p.name);
  return names.length > 0 ? `この場にいる人物：${names.join('、')}` : '';
}

async function generateCharacterLine(characterId, promptHint, execCtx) {
  const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
  const participant = execCtx.session.participants.find((p) => p.character_id === characterId);
  const outfit = participant?.current_outfit_id
    ? db.prepare('SELECT * FROM outfits WHERE id = ?').get(participant.current_outfit_id)
    : null;
  const undressStateLines = getUndressStateLines(execCtx.playthroughId, execCtx.sessionId, characterId);

  const systemPrompt = [
    serializeCharacter(character, outfit, undressStateLines),
    presentParticipantsLine(execCtx, characterId),
    '',
    'あなたは上記のキャラクターになりきって、日本語で一言だけセリフを発してください。',
    '地の文・タグ・鉤括弧は不要で、セリフ本文のみを出力してください。',
    // ${target1}/${キャラ名} resolve to real participant names here too, same
    // as fixed-mode text -- a hint author can write "${target1}をからかう
    // 一言" and have it mean the actual co-present character, not a token
    // the model has never seen.
    `指示：${resolvePlaceholderNames(promptHint, execCtx) ?? ''}`,
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
    `指示：${resolvePlaceholderNames(promptHint, execCtx) ?? ''}`,
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

// Resolves ${target1}/${target2}/${キャラ名} tokens in a fixed narration/
// dialogue text to the referenced participant's display name (same token
// grammar as generate_image's prompt_override, see placeholderResolution.js
// -- a ".category" suffix has no meaning for a name and is simply dropped).
// Candidate priority: @mention this turn, else (for a per_character_firing
// event) the one candidate this particular firing is about, else everyone
// currently present.
//
// The matchedCharacterIds tier matters concretely: without it, ${target1} in
// a per_character_firing event's narration falls back to "everyone present"
// and names whichever participant happens to be first in session order --
// which, with two characters mid-pregnancy at different stages in the same
// room, is not necessarily the one this firing is actually about.
function resolvePlaceholderNames(text, execCtx) {
  if (!text) return text;
  const participants = execCtx.session.participants;
  const participantsByName = buildParticipantsByName(participants);
  const mentionedIds = resolveMentionedList(execCtx.mentionedCharacterIds, null);
  const candidateIds = mentionedIds.length > 0 ? mentionedIds : execCtx.matchedCharacterIds;
  const candidateParticipants = candidateIds ? candidateIds.map((id) => participants.find((p) => p.character_id === id)).filter(Boolean) : participants;
  return text.replace(/\$\{([^}]+)\}/g, (match, token) => {
    const { participant } = resolveTargetToken(token, candidateParticipants, participantsByName);
    return participant ? participant.name : '';
  });
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
    const content = mode === 'fixed' ? resolvePlaceholderNames(text, execCtx) : await generateNarrationLine(prompt_hint, execCtx);
    const message = createMessage(execCtx.sessionId, { sender_type: 'narration', content });
    broadcast(execCtx.sessionId, { type: 'message_complete', message });
    return { inserted: 'narration' };
  }

  const content = mode === 'fixed' ? resolvePlaceholderNames(text, execCtx) : await generateCharacterLine(character_id, prompt_hint, execCtx);
  const message = createMessage(execCtx.sessionId, {
    sender_type: 'character',
    character_id,
    content,
    emotion_tag: emotion_tag ?? fallbackEmotionKey(),
  });
  broadcast(execCtx.sessionId, { type: 'message_complete', message });
  return { inserted: 'character', character_id };
}
