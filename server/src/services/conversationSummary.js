import { db } from '../db/connection.js';
import { setConversationSummary } from '../db/repositories/roomSessionsRepo.js';
import { generateChatCompletion } from './koboldClient.js';

// 会話の要約(圧縮、0121)。character_memories(memoryAutoExtract.js)が「キャラが
// 今後もずっと覚えている出来事」を追記していくのに対し、こちらは「この場面で
// これまでに何があったか」という会話の筋そのものを1つのあらすじとして持ち回る。
// 役割分担は、セッション内の継続性＝この要約／セッションを越える継続性＝記憶。
//
// 生ログはトークン予算を超えた分から順に落ちていくが、この要約はシステム
// プロンプト側に載る(promptBuilder.js)ので切り捨ての影響を受けない——古い
// やりとりが履歴から溢れても話の筋だけは残る、というのが狙い。
function characterNameFor(characterId) {
  return db.prepare('SELECT name FROM characters WHERE id = ?').get(characterId)?.name ?? '???';
}

function formatLine(row) {
  if (row.sender_type === 'user') return `ユーザー：${row.content}`;
  if (row.sender_type === 'character') return `${characterNameFor(row.character_id)}：${row.content}`;
  return `（地の文）${row.content}`;
}

// 前回の畳み込み以降のメッセージだけを見る。毎回ゼロから全文を要約し直すのでは
// なく「前回のあらすじ＋その後の差分」を新しいあらすじに畳み直す積み上げ方式に
// しているのは、会話が伸びても1回あたりの入力量が一定に保たれるため。
//
// force(0122): セッション境界モードの日替わり処理(handleDayRollover)が、
// 間隔に達していなくても区切り行の手前までを強制的に畳み込むために使う。
// 明示的に無効(interval == null)の場合はforceでも何もしない——「あらすじ機能
// 自体を使わない」という設定は尊重する。
export async function maybeUpdateConversationSummary(session, world, { force = false } = {}) {
  const interval = world.conversation_summary_interval_turns;
  if (interval == null || interval <= 0) return;

  const sinceId = session.conversation_summary_last_message_id ?? 0;
  const pending = db
    .prepare(`SELECT * FROM messages WHERE room_session_id = ? AND id > ? AND content_type = 'text' ORDER BY id ASC`)
    .all(session.id, sinceId);

  // ユーザー発言の数で数えるのは、関係値の自動更新など既存の周期処理と単位を
  // 揃えるため(地の文やキャラの発言はモデルの饒舌さで増減するので基準に向かない)。
  const userTurns = pending.filter((row) => row.sender_type === 'user').length;
  if (!force && userTurns < interval) return;
  if (pending.length === 0) return;

  const transcript = pending.map(formatLine).join('\n');
  if (!transcript.trim()) return;

  const previous = (session.conversation_summary ?? '').trim();
  const prompt = [
    'あなたは進行中の物語の記録係です。以下の「これまでのあらすじ」と「その後のやりとり」を、1つのあらすじにまとめ直してください。',
    '',
    ...(previous ? ['【これまでのあらすじ】', previous, ''] : []),
    '【その後のやりとり】',
    transcript,
    '',
    '出力のルール：',
    '- あらすじだけを出力してください。前置き・見出し・箇条書きの記号は不要です。',
    '- 誰が誰に何をしたか、関係や状況がどう変わったかが後から読んで分かるように書いてください。主語は省略せず、プレイヤーを指す場合は「あなた」と書きます。',
    '- 新しいやりとりの内容を必ず反映しつつ、古い内容も要点は残してください。ただし全体で400字程度に収まるよう、細かい言い回しや繰り返しは削ってください。',
    '- 会話をそのまま書き写すのではなく、地の文の要約として書いてください。',
  ].join('\n');

  try {
    const raw = await generateChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 600,
      temperature: 0.3,
    });
    const summary = (raw ?? '').trim();
    // 空応答で既存のあらすじを消してしまわないよう、中身がある時だけ差し替える。
    if (!summary) {
      console.log('conversation summary: empty output, keeping previous summary');
      return;
    }
    setConversationSummary(session.id, summary, pending[pending.length - 1].id);
  } catch (err) {
    console.error('conversation summary update failed:', err);
  }
}
