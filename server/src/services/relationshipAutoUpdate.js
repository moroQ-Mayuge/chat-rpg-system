import { db } from '../db/connection.js';
import { countUserTurnsForPlaythrough } from '../db/repositories/messagesRepo.js';
import { listLlmAutoUpdateEnabledAxes } from '../db/repositories/relationshipAxesRepo.js';
import { getValue, adjustValue } from '../db/repositories/relationshipStatesRepo.js';
import { setRelationshipUpdateCheckpoint } from '../db/repositories/roomSessionsRepo.js';
import { withDisambiguatedNames } from './participantNaming.js';
import { generateChatCompletion } from './koboldClient.js';
import { broadcast } from '../ws/rooms.js';

// LLM-driven periodic relationship-value update (SPEC.md): every
// world.relationship_update_interval_turns user messages (playthrough-
// cumulative), or once as a catch-up when a room session ends/moves
// ({force: true}), asks the LLM how the currently-present characters'
// relationship values should have shifted given the recent conversation.
//
// Deliberately a SEPARATE follow-up LLM call (unlike the status-value
// mechanism, which piggybacks on the main per-turn completion via
// STAT_CHANGE) -- this only runs every N turns, so the extra latency is
// acceptable, and it needs a materially different, multi-line structured
// output shape than a single per-turn tag would comfortably carry. Prompt
// shape follows eventEngine/conditions/llmJudge.js's precedent (a single
// plain user-role message with the conversation inlined as prose, low
// temperature for a classification-like task), extended from a single
// yes/no answer to multiple "キャラ名|軸名|符号付き整数" lines.
function characterNameFor(characterId) {
  return db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId)?.name ?? '???';
}

// Plain-text (not chat-completions-role) readback of this session's most
// recent messages, capped at `limit` -- deliberately not reusing
// promptBuilder.js's buildHistoryMessages, since that builds a role-tagged
// array for a continuing chat, while this is a single inlined-prose passage
// for a one-shot judgment call (same shape llm_judge.js uses).
function buildRecentTranscript(sessionId, limit) {
  const rows = db
    .prepare(
      `SELECT * FROM messages WHERE room_session_id = ? AND content_type = 'text' ORDER BY id DESC LIMIT ?`,
    )
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

export async function maybeRunRelationshipAutoUpdate(session, world, { force = false } = {}) {
  if (world.relationship_update_interval_turns == null) return;

  const turnNumber = countUserTurnsForPlaythrough(session.playthrough_id);
  const elapsed = turnNumber - session.relationship_update_last_turn;
  if (elapsed <= 0) return; // nothing new since the last run (also guards force-catch-up double-fire)
  if (!force && elapsed < world.relationship_update_interval_turns) return;

  const axes = listLlmAutoUpdateEnabledAxes('relationship');
  if (axes.length === 0 || !session.participants?.length) {
    setRelationshipUpdateCheckpoint(session.id, turnNumber);
    return;
  }

  const disambiguated = withDisambiguatedNames(session.participants);
  const cap = Math.min(Math.max(world.relationship_update_interval_turns * 2, 6), 20);
  const transcript = buildRecentTranscript(session.id, cap);

  const participantLines = disambiguated
    .map(
      (p) =>
        `${p.display_name}：` +
        axes.map((a) => `${a.name}=${getValue(session.playthrough_id, p.character_id, a.id, session.id, p.id)}`).join('、'),
    )
    .join('\n');

  const prompt = [
    '次の最近の会話を読んで、各キャラクターの関係値がどう変化したか判断してください。',
    '',
    transcript || '（会話なし）',
    '',
    '現在の関係値：',
    participantLines,
    '',
    '変化があった場合のみ、1行につき1件、以下の形式で出力してください（変化がなければ「変化なし」とだけ出力）：',
    'キャラ名|軸名|符号付き整数',
  ].join('\n');

  try {
    const raw = await generateChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
      temperature: 0.2,
    });

    for (const line of raw.split('\n')) {
      const m = line.trim().match(/^(.+?)\|(.+?)\|([+-]?\d+)$/);
      if (!m) continue;
      const [, charName, axisName, deltaStr] = m;
      const participant = disambiguated.find((p) => p.display_name === charName.trim());
      const axis = axes.find((a) => a.name === axisName.trim());
      if (!participant || !axis) continue;

      const previousValue = getValue(session.playthrough_id, participant.character_id, axis.id, session.id, participant.id);
      const newValue = adjustValue(
        session.playthrough_id,
        participant.character_id,
        axis.id,
        'add',
        parseInt(deltaStr, 10),
        session.id,
        participant.id,
      );
      if (world.notify_relationship_changes && newValue !== previousValue) {
        const direction = newValue > previousValue ? '上がった' : '下がった';
        broadcast(session.id, {
          type: 'relationship_changed',
          description: `${participant.display_name}の${axis.name}が${direction}`,
        });
      }
    }
  } catch (err) {
    console.error('relationship auto-update failed:', err);
  } finally {
    setRelationshipUpdateCheckpoint(session.id, turnNumber);
  }
}
