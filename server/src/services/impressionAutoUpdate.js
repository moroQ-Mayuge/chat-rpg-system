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
    '会話の内容を踏まえて更新すべきものだけ、1行につき1件、以下の形式で出力してください（変化がなければ「変化なし」とだけ出力）：',
    'キャラ名|フィールドキー|新しい値',
    '新しい値は一文程度の短い日本語の地の文とし、改行や「|」は含めないでください。',
  ].join('\n');

  try {
    const raw = await generateChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 400,
      temperature: 0.4,
    });

    for (const line of raw.split('\n')) {
      const m = line.trim().match(/^(.+?)\|(.+?)\|(.+)$/);
      if (!m) continue;
      const [, charName, fieldKey, newValue] = m;
      const found = withFields.find((f) => f.participant.display_name === charName.trim());
      if (!found || !found.fields.some((field) => field.field_key === fieldKey.trim())) continue;

      setImpressionValue(session.playthrough_id, found.participant.character_id, fieldKey.trim(), newValue.trim(), session.id, found.participant.id);
    }
  } catch (err) {
    console.error('impression auto-update failed:', err);
  }
}
