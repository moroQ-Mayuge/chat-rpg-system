import { db } from '../db/connection.js';
import { serializeCharacter } from './characterSheetFormat.js';

const HISTORY_LIMIT = 20;

function getCharacterAndOutfit(participant) {
  const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(participant.character_id);
  const outfit = participant.current_outfit_id
    ? db.prepare('SELECT * FROM outfits WHERE id = ?').get(participant.current_outfit_id)
    : null;
  return { character, outfit };
}

function buildSystemPrompt(session, participants) {
  const emotionKeys = db.prepare('SELECT llm_tag_key FROM expression_types').all().map((r) => r.llm_tag_key);

  const characterCards = participants
    .map((p) => {
      const { character, outfit } = getCharacterAndOutfit(p);
      return serializeCharacter(character, outfit);
    })
    .join('\n');

  const participantNames = participants.map((p) => p.name).join('、');

  return [
    `場所：${session.current_location_text}`,
    `雰囲気：${session.current_atmosphere_text}`,
    `この部屋に同席しているキャラクター：${participantNames}`,
    characterCards,
    '「秘密」の項目は関係性や状況に応じて慎重に扱い、安易に暴露しないでください。',
    '',
    'あなたは上記のキャラクターたちになりきって、日本語で応答してください。以下の出力フォーマットに厳密に従ってください。',
    '[キャラ名]: セリフ本文 [EMOTION:感情キー]',
    '[NARRATION]: 地の文・情景描写（任意、必要な場合のみ）',
    '[SCENE_CHANGE]: 場所や状況が変わった場合のみ、変化後の内容を1行で（任意）',
    `感情キーは次のいずれかを使ってください：${emotionKeys.join(', ')}`,
    '同席していないキャラクターの発言は書かないでください。全員が毎回発言する必要はなく、自然な範囲で応答してください。',
    'ユーザーの発言や、次のユーザーターンを先取りして書かないでください。',
    '',
    '出力例（場所が変わった場合）：',
    '[SCENE_CHANGE]: 夕暮れの校門前',
    '[みお]: やっと着いたね [EMOTION:smile]',
    '[NARRATION]: 二人は連れ立って校門をくぐった。',
  ].join('\n');
}

// Groups the session's text-message history into (user turn) / (assistant turn)
// pairs for the chat-completions message array. Multiple character/narration
// rows produced by one earlier generation are re-joined into a single
// script-format assistant message, since that's how they were originally
// generated together.
function buildHistoryMessages(sessionId) {
  const rows = db
    .prepare("SELECT * FROM messages WHERE room_session_id = ? AND content_type = 'text' ORDER BY id ASC LIMIT ?")
    .all(sessionId, HISTORY_LIMIT * 4);

  const characterNameCache = new Map();
  function nameFor(characterId) {
    if (!characterNameCache.has(characterId)) {
      const row = db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId);
      characterNameCache.set(characterId, row?.name ?? '不明');
    }
    return characterNameCache.get(characterId);
  }

  const messages = [];
  let assistantBuffer = [];

  function flushAssistantBuffer() {
    if (assistantBuffer.length === 0) return;
    messages.push({ role: 'assistant', content: assistantBuffer.join('\n') });
    assistantBuffer = [];
  }

  for (const row of rows) {
    if (row.sender_type === 'user') {
      flushAssistantBuffer();
      messages.push({ role: 'user', content: row.content });
    } else if (row.sender_type === 'character') {
      assistantBuffer.push(`[${nameFor(row.character_id)}]: ${row.content} [EMOTION:${row.emotion_tag || 'normal'}]`);
    } else if (row.sender_type === 'narration') {
      assistantBuffer.push(`[NARRATION]: ${row.content}`);
    }
  }
  flushAssistantBuffer();

  return messages.slice(-HISTORY_LIMIT);
}

// Builds the messages array for a chat-completions call covering every active
// participant in one shot (SPEC.md 3.8 — a single call generates all present
// characters' lines in script format, rather than one call per character).
export function buildMultiCharacterMessages(session) {
  if (!session.participants.length) return null;

  const systemPrompt = buildSystemPrompt(session, session.participants);
  const history = buildHistoryMessages(session.id);

  return {
    messages: [{ role: 'system', content: systemPrompt }, ...history],
    participants: session.participants,
  };
}
