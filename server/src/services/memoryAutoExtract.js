import { db } from '../db/connection.js';
import { addMemory, canHaveMemories, formatOccurredLabel, listMemoriesForPrompt } from '../db/repositories/characterMemoriesRepo.js';
import { withDisambiguatedNames } from './participantNaming.js';
import { generateChatCompletion } from './koboldClient.js';

// LLM extraction of "what happened in this scene that's worth remembering
// long-term" into character_memories (0068), run once per session transition
// from the same /exit and /move hooks as impressionAutoUpdate.js. The two are
// deliberately separate: impression fields capture the character's CURRENT
// feelings (one value, overwritten every time), while memories are an
// append-only record of events that must survive many later sessions.
//
// World-level opt-in, default off (memory_auto_extract_enabled) -- this is a
// second extra LLM call per session transition on top of the impression one.
function characterNameFor(characterId) {
  return db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId)?.name ?? '???';
}

// Same shape as impressionAutoUpdate.js's buildRecentTranscript (which in turn
// mirrors relationshipAutoUpdate.js's) -- a single inlined-prose passage for a
// one-shot judgment call, kept local per the pattern those two established.
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

// The prompt asks for「なし」when there's nothing worth recording, but models
// routinely wrap that in the line format anyway ("キャラ名|なし"), which used
// to sail through the parser and get stored as a memory — 7 of the 70
// auto-recorded entries in a real save were junk like this.
const EMPTY_MEMORY_PATTERN = /^(なし|無し|特になし|変化なし|該当なし)[。.！!]*$/;

function isMeaningfulMemory(content) {
  const trimmed = (content ?? '').trim();
  return trimmed.length > 0 && !EMPTY_MEMORY_PATTERN.test(trimmed);
}

export async function maybeRunMemoryAutoExtract(session, world) {
  if (!world.memory_auto_extract_enabled) return;
  if (!session.participants?.length) return;

  // Mobs are excluded outright (they reset per session by design), so a scene
  // of nothing but extras has nothing to record.
  const eligible = withDisambiguatedNames(session.participants).filter((p) => canHaveMemories(p.character_id));
  if (eligible.length === 0) return;

  const transcript = buildRecentTranscript(session.id, 20);
  if (!transcript.trim()) return;

  // Showing what's already on file keeps the model from re-recording the same
  // event every session, which would otherwise push genuinely new memories out
  // of the memory_prompt_limit window.
  const existingLines = eligible
    .map((p) => {
      const existing = listMemoriesForPrompt(session.playthrough_id, p.character_id, world.memory_prompt_limit || 5);
      return existing.length ? `${p.display_name}：` + existing.map((m) => m.content).join(' / ') : null;
    })
    .filter(Boolean)
    .join('\n');

  const prompt = [
    '次の会話を読んで、登場キャラクターが「今後もずっと覚えているような重要な出来事」があったかを判断してください。',
    '',
    transcript,
    '',
    ...(existingLines ? ['既に記録済みの記憶（重複して記録しないでください）：', existingLines, ''] : []),
    `対象キャラクター：${eligible.map((p) => p.display_name).join('、')}`,
    '',
    '該当する出来事があれば、1行につき1件、以下の形式で出力してください（最大2件）：',
    'キャラ名|記憶内容',
    '',
    '記憶内容には次の2つを必ず含めてください：',
    '1. 誰が誰に何をしたのか。主語を省略せず、必ず書いてください。プレイヤーを指す場合は必ず「あなた」と書きます。',
    '2. その結果、そのキャラクターが「あなた」をどう思うようになったか（気持ちや関係の変化）。',
    '例：あなたに無理やり唇を奪われ、逆らえない相手だと怯えるようになった',
    '',
    '記憶内容は一文程度の短い日本語の地の文とし、改行や「|」は含めないでください。',
    '日常的なやり取りや些細な会話は記録不要です。重要な出来事が無ければ、行を1つも出力せず「なし」とだけ出力してください。',
  ].join('\n');

  try {
    const raw = await generateChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
      temperature: 0.4,
    });

    const occurredLabel = formatOccurredLabel(session.playthrough_id);
    let recorded = 0;
    for (const line of raw.split('\n')) {
      if (recorded >= 2) break;
      const m = line.trim().match(/^(.+?)\|(.+)$/);
      if (!m) continue;
      const [, charName, content] = m;
      const found = eligible.find((p) => p.display_name === charName.trim());
      if (!found || !isMeaningfulMemory(content)) continue;

      addMemory({
        playthrough_id: session.playthrough_id,
        character_id: found.character_id,
        content: content.trim(),
        occurred_label: occurredLabel,
        source: 'auto',
      });
      recorded += 1;
    }
  } catch (err) {
    console.error('memory auto-extract failed:', err);
  }
}
