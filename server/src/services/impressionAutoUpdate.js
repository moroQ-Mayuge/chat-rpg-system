import { db } from '../db/connection.js';
import { listImpressionValues, setImpressionValue } from '../db/repositories/characterImpressionStatesRepo.js';
import { withDisambiguatedNames } from './participantNaming.js';
import { generateChatCompletion } from './koboldClient.js';

// LLM-driven update of each present character's freeform "relationship/
// impression" text fields (character_impression_states), run once whenever a
// room session ends (session移行時 -- /exit or /move, both force-call this
// unconditionally when world.impression_auto_update_enabled is on). Unlike
// relationshipAutoUpdate.js's periodic every-N-turns numeric deltas, this has
// no turn-interval knob: it always runs exactly once per session transition,
// since the whole point is capturing "what just happened in this scene" into
// free text before the session's own conversation context goes away.
//
// World-level opt-in, default off (confirmed with the user) -- an extra LLM
// call per session transition has a real latency cost, and most Worlds don't
// use impression fields at all (character_impression_defaults empty means
// nothing to update anyway).
function characterNameFor(characterId) {
  return db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId)?.name ?? '???';
}

// Same shape as relationshipAutoUpdate.js's buildRecentTranscript -- a single
// inlined-prose passage for a one-shot judgment call, not the role-tagged
// array promptBuilder.js builds for an ongoing chat.
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

// 「変化なし」を値として書き込ませないための番人。
//
// プロンプトは変化が無い時「変化なし」とだけ返すよう指示しているが、モデルは
// 指定形式に包んで「キャラ名|あなたとの関係|変化なし」と返してくることがあり、
// これが素通りすると *前の状態が「変化なし」という文字列で潰される*（実プレイ
// での報告）。memoryAutoExtract.js が同じ罠を EMPTY_MEMORY_PATTERN で既に
// 塞いでおり、これはその印象フィールド版。印象は自由記述なので「変わらず」
// 「現状維持」等の言い換えが出やすく、語彙を広めに取ってある。
const NO_CHANGE_PATTERN =
  /^(変化なし|変化無し|変更なし|変更無し|なし|無し|特になし|該当なし|同じ|同上|変わらず|変わらない|変わりなし|現状維持|そのまま|[-ー―—]+)[。.！!]*$/;

function isMeaningfulValue(value) {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 && !NO_CHANGE_PATTERN.test(trimmed);
}

export async function maybeRunImpressionAutoUpdate(session, world) {
  if (!world.impression_auto_update_enabled) return;
  if (!session.participants?.length) return;

  const disambiguated = withDisambiguatedNames(session.participants);
  const fieldsByParticipant = disambiguated.map((p) => ({
    participant: p,
    fields: listImpressionValues(session.playthrough_id, p.character_id, session.id, p.id),
  }));
  const withFields = fieldsByParticipant.filter((f) => f.fields.length > 0);
  if (withFields.length === 0) return;

  const transcript = buildRecentTranscript(session.id, 20);
  const currentLines = withFields
    .map(({ participant, fields }) => `${participant.display_name}：` + fields.map((f) => `${f.field_key}=「${f.value}」`).join('、'))
    .join('\n');

  const prompt = [
    '次の最近の会話を読んで、各キャラクターの心情・関係性フィールドを更新すべきか判断してください。',
    '',
    transcript || '（会話なし）',
    '',
    '現在の値：',
    currentLines,
    '',
    '会話の内容を踏まえて更新すべきものだけ、1行につき1件、以下の形式で出力してください：',
    'キャラ名|フィールドキー|新しい値',
    '新しい値は一文程度の短い日本語の地の文とし、改行や「|」は含めないでください。',
    // 「変化なし」を値の位置に書かせないための指示。ここが曖昧だと
    // 「キャラ名|あなたとの関係|変化なし」と返され、前の状態が潰される。
    '変化が無いフィールドは、その行を出力しないでください。「変化なし」「変わらず」等を新しい値の位置に書いてはいけません。',
    '更新すべきフィールドが1つも無い場合は、行を出力せず「なし」とだけ出力してください。',
  ].join('\n');

  try {
    const raw = await generateChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400,
      temperature: 0.4,
    });

    let applied = 0;
    for (const line of raw.split('\n')) {
      const m = line.trim().match(/^(.+?)\|(.+?)\|(.+)$/);
      if (!m) continue;
      const [, charName, fieldKey, newValue] = m;
      const found = withFields.find((f) => f.participant.display_name === charName.trim());
      if (!found) continue;
      const currentField = found.fields.find((field) => field.field_key === fieldKey.trim());
      if (!currentField) continue;

      // 「変化なし」系・空文字は書き込まない。ここを通すと前の状態が消える。
      if (!isMeaningfulValue(newValue)) continue;
      // 同じ内容なら書かない（updated_atだけ動くのを避ける）
      if (newValue.trim() === (currentField.value ?? '').trim()) continue;

      setImpressionValue(session.playthrough_id, found.participant.character_id, fieldKey.trim(), newValue.trim(), session.id, found.participant.id);
      applied += 1;
    }
    // 0件が「本当に変化が無かった」のか「出力形式がズレてパースに失敗した」のか
    // 区別できるようにする（memoryAutoExtract.jsと同じ方針、0件の時だけ出す）。
    if (applied === 0) {
      console.log('impression auto-update: applied 0, raw output was:', JSON.stringify(raw));
    }
  } catch (err) {
    console.error('impression auto-update failed:', err);
  }
}
