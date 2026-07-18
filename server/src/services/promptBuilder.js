import { db } from '../db/connection.js';
import { serializeCharacter } from './characterSheetFormat.js';
import { resolveProtagonist } from '../db/repositories/playthroughsRepo.js';
import { listCategoriesForWorld } from '../db/repositories/itemCategoriesRepo.js';
import { getCurrentAddress } from '../db/repositories/characterAddressStatesRepo.js';
import { getUndressStateLines } from './undressState.js';
import { withDisambiguatedNames } from './participantNaming.js';

const HISTORY_LIMIT = 20;

function getCharacterAndOutfit(participant) {
  const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(participant.character_id);
  const outfit = participant.current_outfit_id
    ? db.prepare('SELECT * FROM outfits WHERE id = ?').get(participant.current_outfit_id)
    : null;
  return { character, outfit };
}

// Builds a block establishing what "you" (the human user) are to the LLM.
// Two distinct modes (SPEC-level design, resolved from World/Playthrough
// settings via resolveProtagonist):
//   'narrator'  — the user isn't a character at all; a god/GM viewpoint that
//     can directly dictate the scene and NPC behavior (how the app behaved
//     before the protagonist feature existed, made explicit again as a
//     selectable mode rather than an implicit default).
//   'character' — the user plays a present person. Deliberately omits
//     personality/speech-style — those are the player's own to control via
//     what they type, not something the LLM should be told to enforce.
//     Renders nothing if every field is blank.
function buildProtagonistBlock(protagonist) {
  if (protagonist.mode === 'narrator') {
    return [
      '[ユーザーの立ち位置について]',
      'ユーザーはこの物語の登場人物ではなく、場面全体を管理する神・ナレーター的な視点です。',
      'ユーザーの発言は、特定キャラクターの言動ではなく、場面・状況・NPCの言動を直接指示する内容として扱ってください。',
      '指示された内容は、キャラクター自身の意思や性格とは独立に、可能な限りそのまま場面に反映してください。',
    ].join('\n');
  }

  const hasAnyField = [protagonist.name, protagonist.occupation, protagonist.appearance, protagonist.gender, protagonist.notes].some((v) =>
    v.trim(),
  );
  if (!hasAnyField) return null;

  const lines = [
    '[主人公（あなた）について — NPCが認識している設定情報]',
    `呼び方：${protagonist.nickname.trim() || 'あなた'}`,
  ];
  if (protagonist.name.trim()) lines.push(`名前：${protagonist.name}`);
  if (protagonist.gender.trim()) lines.push(`性別：${protagonist.gender}`);
  if (protagonist.occupation.trim()) lines.push(`職業・立場：${protagonist.occupation}`);
  if (protagonist.appearance.trim()) lines.push(`容貌：${protagonist.appearance}`);
  if (protagonist.notes.trim()) lines.push(`補足：${protagonist.notes}`);
  lines.push('※ この情報はNPC側が主人公について認識している設定であり、主人公自身のセリフ・行動・心情を生成する根拠にしないでください。主人公の性格・話し方・行動は常にプレイヤー自身の発言に委ねてください。');

  return lines.join('\n');
}

function buildSystemPrompt(session, participants) {
  const emotionKeys = db.prepare('SELECT llm_tag_key FROM expression_types').all().map((r) => r.llm_tag_key);
  const worldId = db.prepare('SELECT world_id FROM playthroughs WHERE id = ?').get(session.playthrough_id).world_id;
  const itemCategoryNames = listCategoriesForWorld(worldId).map((c) => c.name);

  // Disambiguates same-named participants (e.g. two "みお"s cast in the same
  // scene) with a "(2)" suffix, since the LLM has no other way to tell them
  // apart in the [Name]: script format — both the character cards below and
  // the participant list line need to show whatever name the model is
  // expected to echo back, so roomSessions.js's parsing lookup agrees.
  const disambiguated = withDisambiguatedNames(participants);

  const characterCards = disambiguated
    .map((p) => {
      const { character, outfit } = getCharacterAndOutfit(p);
      const currentAddress = getCurrentAddress(session.playthrough_id, character.id, session.id);
      const effectiveCharacter = { ...character, name: p.display_name, ...(currentAddress ? { call_user_as: currentAddress } : {}) };
      const undressStateLines = getUndressStateLines(session.playthrough_id, session.id, character.id);
      return serializeCharacter(effectiveCharacter, outfit, undressStateLines);
    })
    .join('\n');

  const participantNames = disambiguated.map((p) => p.display_name).join('、');
  const protagonist = resolveProtagonist(session.playthrough_id);
  const protagonistBlock = buildProtagonistBlock(protagonist);

  // The protagonist block above tells the LLM the player's name/nickname —
  // without an explicit denylist, the model treats that as just another
  // known character name and starts emitting "[名前]: ..." lines for the
  // player itself (observed live: setting a protagonist name made the LLM
  // narrate/voice the player's turns unprompted). Names must be named
  // explicitly here; the general "don't preempt the user" instruction alone
  // wasn't enough to stop it once the model had a concrete name to use.
  const forbiddenNames =
    protagonist.mode === 'character'
      ? [protagonist.name, protagonist.nickname].map((s) => s.trim()).filter(Boolean)
      : [];
  const noSelfSpeechRule =
    forbiddenNames.length > 0
      ? `主人公（${forbiddenNames.join('／')}）自身のセリフ・行動・心情は絶対に生成しないでください。[${forbiddenNames.join(']や[')}]という形式の行を出力してはいけません。主人公の発言・行動は必ずユーザー自身の入力に任せてください。`
      : 'ユーザー（主人公）自身のセリフや行動を先取りして生成しないでください。';

  return [
    `場所：${session.current_location_text}`,
    `雰囲気：${session.current_atmosphere_text}`,
    `この部屋に同席しているキャラクター：${participantNames}`,
    protagonistBlock,
    characterCards,
    '「秘密」の項目は関係性や状況に応じて慎重に扱い、安易に暴露しないでください。',
    '',
    'セリフや地の文は自然でくだけた口語にし、説明的で硬い言い回しは避けてください。',
    'あなたは上記のキャラクターたちになりきって、日本語で応答してください。以下の出力フォーマットに厳密に従ってください。',
    '[キャラ名]: セリフ本文 [EMOTION:感情キー]',
    '[NARRATION]: 地の文・情景描写（任意、必要な場合のみ）',
    '[SCENE_CHANGE]: 場所や状況が変わった場合のみ、変化後の内容を1行で（任意）',
    `[ITEM_GRANT: アイテム名|カテゴリ名]: アイテムの簡単な説明（キャラクターが物語上、実際にユーザーへ具体的な物を渡した場合のみ。世間話や比喩表現では使わない）。カテゴリ名は次のいずれかから選んでください：${itemCategoryNames.join(', ')}`,
    `感情キーは次のいずれかを使ってください：${emotionKeys.join(', ')}`,
    '同席していないキャラクターの発言は書かないでください。全員が毎回発言する必要はなく、自然な範囲で応答してください。',
    'ユーザーの発言や、次のユーザーターンを先取りして書かないでください。',
    noSelfSpeechRule,
    '',
    '出力例（場所が変わった場合）：',
    '[SCENE_CHANGE]: 夕暮れの校門前',
    '[みお]: やっと着いたね [EMOTION:smile]',
    '[NARRATION]: 二人は連れ立って校門をくぐった。',
    '',
    '出力例（キャラクターが物を渡した場合）：',
    '[みお]: これ、あげる [EMOTION:smile]',
    `[ITEM_GRANT: 手作りクッキー|${itemCategoryNames[0] ?? '未分類'}]: みおが焼いた素朴な味のクッキー`,
    '[NARRATION]: みおは小さな包みを差し出した。',
    '',
    '❌ 誤った例（名前がブラケットの外に出ている）: 陽葵[困り顔]: 今日は暇だなあ',
    '✅ 正しい例: [陽葵]: 今日は暇だなあ [EMOTION:smile]',
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
export function buildMultiCharacterMessages(session, options = {}) {
  if (!session.participants.length) return null;

  const systemPrompt = buildSystemPrompt(session, session.participants);
  const history = buildHistoryMessages(session.id);
  const messages = [{ role: 'system', content: systemPrompt }, ...history];

  // options.ephemeralUserTurn: appended to the array sent to the LLM only —
  // never persisted to the messages table, never shown in the chat UI. Used
  // for "continue from here" turns, where history alone would end on an
  // assistant message (confirmed to produce an empty completion otherwise).
  if (options.ephemeralUserTurn) {
    messages.push({ role: 'user', content: options.ephemeralUserTurn });
  }

  return {
    messages,
    participants: session.participants,
  };
}
