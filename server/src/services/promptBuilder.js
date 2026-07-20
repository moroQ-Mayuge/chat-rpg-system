import { db } from '../db/connection.js';
import { serializeCharacter } from './characterSheetFormat.js';
import { resolveProtagonist, getMoney, getPlaythrough } from '../db/repositories/playthroughsRepo.js';
import { listCategoriesForWorld } from '../db/repositories/itemCategoriesRepo.js';
import { getCurrentAddress } from '../db/repositories/characterAddressStatesRepo.js';
import { getUndressStateLines } from './undressState.js';
import { withDisambiguatedNames } from './participantNaming.js';
import { listCandidateCategoriesForRoom } from '../db/repositories/roomItemCategoriesRepo.js';
import { listPropsForWorldRoom, listFreePropsForWorldRoom } from '../db/repositories/worldRoomPropsRepo.js';
import { getWorld } from '../db/repositories/worldsRepo.js';
import { listItemsForWorld } from '../db/repositories/itemsRepo.js';

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

function buildSystemPrompt(session, participants, options = {}) {
  const emotionKeys = db.prepare('SELECT llm_tag_key FROM expression_types').all().map((r) => r.llm_tag_key);
  // getPlaythrough() (not a raw world_id lookup) so its attachLabels() gives
  // us the human-readable time-slot/season/day-of-week labels alongside
  // current_weather -- previously fetched nowhere in this file, which is why
  // the LLM had zero signal about time-of-day (e.g. "おはよう" regardless of
  // the actual time slot).
  const playthrough = getPlaythrough(session.playthrough_id);
  const worldId = playthrough.world_id;
  const world = getWorld(worldId);

  // Shopping mode: is_shop room + World currency_enabled. Reuses the same
  // room_template_item_categories candidate list as surroundings-check mode
  // (room_template_item_categories was originally built for that feature,
  // but "which categories can this room's contents come from" is exactly
  // what "what does this shop stock" also needs) -- either mode restricts
  // ITEM_GRANT to the room's own categories instead of the World's full list.
  const isShopMode = Boolean(session.room_is_shop) && world.currency_enabled;
  const roomCandidateItemCategories =
    options.isSurroundingsCheck || isShopMode ? listCandidateCategoriesForRoom(session.room_template_id) : [];
  const itemCategoryNames = (
    roomCandidateItemCategories.length > 0 ? roomCandidateItemCategories : listCategoriesForWorld(worldId)
  ).map((c) => c.name);

  // Disambiguates same-named participants (e.g. two "みお"s cast in the same
  // scene) with a "(2)" suffix, since the LLM has no other way to tell them
  // apart in the [Name]: script format — both the character cards below and
  // the participant list line need to show whatever name the model is
  // expected to echo back, so roomSessions.js's parsing lookup agrees.
  const disambiguated = withDisambiguatedNames(participants);

  // Small local models don't reliably infer "stop voicing this character"
  // from the positive participant list alone (same lesson as the
  // protagonist self-speech guard below) -- naming departed characters
  // explicitly gives the model a concrete negative constraint instead of
  // relying on it noticing their absence from the list.
  const departedNames = db
    .prepare(
      `SELECT DISTINCT c.name FROM room_session_characters rsc
       JOIN characters c ON c.id = rsc.character_id
       WHERE rsc.room_session_id = ? AND rsc.is_active = 0`,
    )
    .all(session.id)
    .map((r) => r.name);

  const characterCards = disambiguated
    .map((p) => {
      const { character, outfit } = getCharacterAndOutfit(p);
      // p.id is the room_session_characters row id -- passing it lets
      // duplicate mob instances (see room_slot_row_level_random_and_mob_duplication)
      // show their own nickname instead of one shared across every instance
      // of that character (relationshipStatesRepo.js/characterAddressStatesRepo.js
      // ignore it entirely for non-mob characters, so this is a no-op there).
      const currentAddress = getCurrentAddress(session.playthrough_id, character.id, session.id, p.id);
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

  // "@周辺" mode: surfaces this room's placed props/facilities to the LLM's
  // text generation for the first time -- normally props are image-generation
  // only (see imagePromptBuilder.js) and never appear in this system prompt
  // at all, so without this the model has no way to know they exist.
  let surroundingsBlock = null;
  if (options.isSurroundingsCheck) {
    const props = listPropsForWorldRoom(worldId, session.room_template_id).map((p) => p.name);
    const freeProps = listFreePropsForWorldRoom(worldId, session.room_template_id).map((p) => p.description);
    const discoverable = [...props, ...freeProps];
    surroundingsBlock =
      discoverable.length > 0
        ? `[周辺確認モード]\nプレイヤーは周辺を調べています。以下は、この場に実際に存在する設備・物です。物語上自然な場合、これらのいずれかをNARRATIONやキャラのセリフで発見・言及してよい：${discoverable.join('、')}`
        : '[周辺確認モード]\nプレイヤーは周辺を調べています。特に目立った設備・物は見当たらない、という展開にしても構いません。';
  }

  // Shopping mode: lists actual priced products (never LLM-invented ones —
  // buy_price is only ever set by an admin) so ITEM_GRANT here means a real
  // sale, not the free "the character happens to hand you something"
  // narrative device the normal ITEM_GRANT instruction describes.
  let shopBlock = null;
  if (isShopMode) {
    const shopProducts = listItemsForWorld(worldId).filter(
      (i) =>
        i.buy_price != null &&
        (roomCandidateItemCategories.length === 0 || roomCandidateItemCategories.some((c) => c.id === i.category_id)),
    );
    const money = getMoney(session.playthrough_id);
    const productLines =
      shopProducts.length > 0
        ? shopProducts.map((i) => `${i.name}（${i.buy_price}${world.currency_unit}）`).join('、')
        : null;
    shopBlock = [
      '[買い物モード]',
      `ここは買い物ができる場所です。プレイヤーの所持金：${money}${world.currency_unit}`,
      productLines
        ? `商品リスト（この中のアイテムのみ[ITEM_GRANT]で実際に販売できます。価格に言及して構いません）：${productLines}`
        : '現在、店頭に並んでいる商品はないようです。',
    ].join('\n');
  }

  // Room-session-scoped free text an event can set at runtime via
  // set_scene_situation (e.g. "${target1}と二人きりでイチャイチャしてる"),
  // resets automatically on room move (new room_sessions row) since it's
  // stored on the session itself, not the room template or playthrough.
  const sceneSituationLine = session.current_scene_situation ? `現在の場面状況：${session.current_scene_situation}` : null;

  // Explicit, instruction-toned line (not just raw data) so the model
  // actually treats it as a constraint on greetings/behavior rather than
  // background trivia it can ignore -- e.g. without this, characters said
  // "おはよう" (good morning) regardless of the actual in-game time slot.
  const timeWeatherLine = [
    `現在時刻・天候：${playthrough.current_time_slot_label ?? '不明'}／${playthrough.current_weather || '不明'}／${playthrough.current_season_label ?? '不明'}`,
    `（${playthrough.current_day_of_week_label ?? '不明'}${playthrough.current_is_holiday ? '・休日' : ''}）。この時刻・天候・曜日と矛盾しない挨拶や言動をしてください（例：夜なのに「おはよう」と言わない）。`,
  ].join('');

  return [
    `場所：${session.current_location_text}`,
    `雰囲気：${session.current_atmosphere_text}`,
    timeWeatherLine,
    sceneSituationLine,
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
    departedNames.length > 0
      ? `特に、以下のキャラクターは既にこの場を離れており、絶対に発言・行動を書いてはいけません：${departedNames.join('、')}`
      : null,
    'ユーザーの発言や、次のユーザーターンを先取りして書かないでください。',
    noSelfSpeechRule,
    surroundingsBlock,
    shopBlock,
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

  // Interleaves a synthetic departure marker at the point in the replayed
  // history where each character actually left, so the model sees an
  // explicit "they're gone" signal instead of just their lines trailing off
  // (which small local models don't reliably infer on their own -- see
  // bugreports_2026-07-19). Sorted by timestamp alongside the message rows;
  // ties resolve message-before-departure via the stable sort below, which
  // is fine since left_at/created_at share second-level resolution anyway.
  const departures = db
    .prepare(
      `SELECT rsc.character_id, rsc.left_at FROM room_session_characters rsc
       WHERE rsc.room_session_id = ? AND rsc.is_active = 0 AND rsc.left_at IS NOT NULL`,
    )
    .all(sessionId);

  const timeline = [
    ...rows.map((row) => ({ type: 'message', at: row.created_at, row })),
    ...departures.map((d) => ({ type: 'departure', at: d.left_at, characterId: d.character_id })),
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const messages = [];
  let assistantBuffer = [];

  function flushAssistantBuffer() {
    if (assistantBuffer.length === 0) return;
    messages.push({ role: 'assistant', content: assistantBuffer.join('\n') });
    assistantBuffer = [];
  }

  for (const entry of timeline) {
    if (entry.type === 'departure') {
      const name = nameFor(entry.characterId);
      assistantBuffer.push(`[NARRATION]: （ここで${name}は退席した。以降${name}はこの場におらず、発言も行動もしない）`);
      continue;
    }
    const row = entry.row;
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

  const systemPrompt = buildSystemPrompt(session, session.participants, { isSurroundingsCheck: options.isSurroundingsCheck });
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
