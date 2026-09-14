import { db } from '../db/connection.js';
import { getCurrentAddress, setCurrentAddress } from '../db/repositories/characterAddressStatesRepo.js';
import { withDisambiguatedNames } from './participantNaming.js';
import { generateChatCompletion } from './koboldClient.js';

// LLM-driven update of each present character's current way of addressing
// the player (character_address_states), run from the same two call sites
// as impressionAutoUpdate.js/memoryAutoExtract.js (turn-interval while
// staying in the same scene, and once more at scene end via
// sessionBoundary.js's runEndOfSceneHooks) and sharing their
// memory_impression_last_turn checkpoint — this is a single-value-overwrite
// update (like impression), just wired through memory's trigger route, per
// the user's explicit request.
//
// World-level opt-in, default off (address_auto_update_enabled) -- a third
// extra LLM call alongside impression/memory on the same checkpoint.
function characterNameFor(characterId) {
  return db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId)?.name ?? '???';
}

// Same shape as impressionAutoUpdate.js's/memoryAutoExtract.js's own copy.
function buildRecentTranscript(sessionId, limit) {
  const rows = db
    .prepare(`SELECT * FROM messages WHERE room_session_id = ? AND content_type = 'text' ORDER BY id DESC LIMIT ?`)
    .all(sessionId, limit)
    .reverse();
  return rows
    .map((row) => {
      if (row.sender_type === 'user') return `ユーザー：${row.content}`;
      if (row.sender_type === 'character') return `${characterNameFor(row.character_id)}：${row.content}`;
      return `（地の文）${row.content}`;
    })
    .join('\n');
}

// impressionAutoUpdate.jsのNO_CHANGE_PATTERNと同じ発想・同じ語彙——「変化なし」
// を値の位置に書かせて前の状態を潰してしまう事故を防ぐ。
const NO_CHANGE_PATTERN =
  /^(変化なし|変化無し|変更なし|変更無し|なし|無し|特になし|該当なし|同じ|同上|変わらず|変わらない|変わりなし|現状維持|そのまま|[-ー―—]+)[。.！!]*$/;

function isMeaningfulAddress(value) {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 && !NO_CHANGE_PATTERN.test(trimmed);
}

// 現在の呼び方の解決。promptBuilder.js(buildSystemPrompt内のeffectiveCharacter
// 組み立て)と同じ優先順位：character_address_states(実プレイ中に変わった値)
// > mob_flavor_presets.call_user_as(ランダムペルソナ割当時の初期値)
// > characters.call_user_as(キャラ本体の固定値)。
function resolveCurrentAddress(playthroughId, sessionId, participant) {
  const current = getCurrentAddress(playthroughId, participant.character_id, sessionId, participant.id);
  if (current) return current;
  if (participant.mob_flavor_call_user_as) return participant.mob_flavor_call_user_as;
  return db.prepare('SELECT call_user_as FROM characters WHERE id = ?').get(participant.character_id)?.call_user_as ?? '';
}

export async function maybeRunAddressAutoUpdate(session, world) {
  if (!world.address_auto_update_enabled) return;
  if (!session.participants?.length) return;

  const disambiguated = withDisambiguatedNames(session.participants);
  const withCurrent = disambiguated.map((p) => ({
    participant: p,
    current: resolveCurrentAddress(session.playthrough_id, session.id, p),
  }));

  const transcript = buildRecentTranscript(session.id, 20);
  if (!transcript.trim()) return;

  const currentLines = withCurrent.map(({ participant, current }) => `${participant.display_name}：${current || '（未設定）'}`).join('\n');

  const prompt = [
    '次の最近の会話を読んで、各キャラクターがプレイヤー（あなた）を呼ぶときの呼び方が変化すべきかどうかを判断してください。',
    '',
    transcript,
    '',
    '現在の呼び方：',
    currentLines,
    '',
    '呼び方が変化すべきキャラについてのみ、1行につき1件、以下の形式で出力してください：',
    'キャラ名|新しい呼び方',
    '新しい呼び方は「お兄ちゃん」「あんた」「〇〇さん」のように、そのキャラが実際に呼びかける時に使う一言・短い呼称にしてください。説明文にしないでください。',
    '変化が無いキャラについては行を出力しないでください。「変化なし」等を新しい呼び方の位置に書いてはいけません。',
    '変化すべきキャラが1人もいなければ、行を出力せず「なし」とだけ出力してください。',
  ].join('\n');

  try {
    const raw = await generateChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
      temperature: 0.4,
    });

    let applied = 0;
    for (const line of raw.split('\n')) {
      const m = line.trim().match(/^(.+?)\|(.+)$/);
      if (!m) continue;
      const [, charName, newAddress] = m;
      const found = withCurrent.find((f) => f.participant.display_name === charName.trim());
      if (!found) continue;

      if (!isMeaningfulAddress(newAddress)) continue;
      if (newAddress.trim() === (found.current ?? '').trim()) continue;

      setCurrentAddress(session.playthrough_id, found.participant.character_id, newAddress.trim(), session.id, found.participant.id);
      applied += 1;
    }
    if (applied === 0) {
      console.log('address auto-update: applied 0, raw output was:', JSON.stringify(raw));
    }
  } catch (err) {
    console.error('address auto-update failed:', err);
  }
}
