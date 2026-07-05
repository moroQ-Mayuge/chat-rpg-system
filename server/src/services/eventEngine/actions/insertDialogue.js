import { db } from '../../../db/connection.js';
import { createMessage } from '../../../db/repositories/messagesRepo.js';
import { broadcast } from '../../../ws/rooms.js';
import { generateChatCompletion } from '../../koboldClient.js';
import { serializeCharacter } from '../../characterSheetFormat.js';

function fallbackEmotionKey() {
  return db.prepare("SELECT llm_tag_key FROM expression_types WHERE name = '通常'").get()?.llm_tag_key ?? 'normal';
}

async function generateCharacterLine(characterId, promptHint, execCtx) {
  const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
  const participant = execCtx.session.participants.find((p) => p.character_id === characterId);
  const outfit = participant?.current_outfit_id
    ? db.prepare('SELECT * FROM outfits WHERE id = ?').get(participant.current_outfit_id)
    : null;

  const systemPrompt = [
    serializeCharacter(character, outfit),
    '',
    'あなたは上記のキャラクターになりきって、日本語で一言だけセリフを発してください。',
    '地の文・タグ・鉤括弧は不要で、セリフ本文のみを出力してください。',
    `指示：${promptHint ?? ''}`,
  ].join('\n');

  const rawText = await generateChatCompletion({
    messages: [{ role: 'system', content: systemPrompt }],
    maxTokens: 150,
    temperature: 0.8,
  });
  return rawText.trim();
}

async function generateNarrationLine(promptHint) {
  const systemPrompt = [
    '以下の指示に基づいて、短い地の文（ナレーション）を日本語で1文だけ出力してください。タグや見出しは不要です。',
    `指示：${promptHint ?? ''}`,
  ].join('\n');
  const rawText = await generateChatCompletion({
    messages: [{ role: 'system', content: systemPrompt }],
    maxTokens: 150,
    temperature: 0.8,
  });
  return rawText.trim();
}

// { mode: "fixed"|"generated", character_id?: number|null, text?, prompt_hint?, emotion_tag? }
export async function executeInsertDialogue(params, execCtx) {
  const { mode, character_id = null, text, prompt_hint, emotion_tag } = params;

  if (character_id == null) {
    const content = mode === 'fixed' ? text : await generateNarrationLine(prompt_hint);
    const message = createMessage(execCtx.sessionId, { sender_type: 'narration', content });
    broadcast(execCtx.sessionId, { type: 'message_complete', message });
    return { inserted: 'narration' };
  }

  const content = mode === 'fixed' ? text : await generateCharacterLine(character_id, prompt_hint, execCtx);
  const message = createMessage(execCtx.sessionId, {
    sender_type: 'character',
    character_id,
    content,
    emotion_tag: emotion_tag ?? fallbackEmotionKey(),
  });
  broadcast(execCtx.sessionId, { type: 'message_complete', message });
  return { inserted: 'character', character_id };
}
