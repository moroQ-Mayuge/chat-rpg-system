import { db } from '../db/connection.js';
import { addMemory, canHaveMemories, listMemoriesForPrompt } from '../db/repositories/characterMemoriesRepo.js';
import { generateChatCompletion } from './koboldClient.js';

// 大きく時間を飛ばす。日数の加算そのものは advanceTime がやるので、ここは
// 「飛ばしたことで辻褄を合わせないといけないもの」を扱う。
//
// 実プレイは6073メッセージで52日しか進まない(120通で1日)。子が会話できる年齢まで
// 逐次プレイで到達するのは無理で、跳ばす以外に手が無い——という測定がこの機能の
// 出発点になっている。

// 跳んだ分だけ実年齢を進める。character_aging = 'static'(サザエさん空間)の
// Worldでは何もしない。
//
// 対象はそのルートに登場済みのキャラだけ(relationship_states に行がある)。
// characters は複数ルートで共有されるマスタなので、あるルートで3年飛ばしたら
// 別ルートのキャラまで歳を取る、では困る……のだが、age_real はキャラ本体の列
// しか無く、ルートごとの年齢を持つ場所が無い。**現状は共有マスタを書き換える**。
// ルート別に持つならキャラの年齢もルート状態に落とす必要があり、それは
// この塊の範囲を超える。
//
// モブはこの絞り込みから自然に外れる。モブの relationship_states は
// playthrough_id が NULL(セッション単位)なので、下のクエリに引っかからない。
// セッションごとにリセットされる使い捨ての存在を歳だけ取らせても意味が無く、
// しかもモブ行は全World・全ルートで共有されているので、外れるのが正しい。
function applyAging(playthroughId, world, days) {
  if (world.character_aging !== 'normal') return { aged: 0, years: 0 };
  const daysPerYear = world.days_per_season * world.season_labels.length;
  const years = Math.floor(days / daysPerYear);
  if (years <= 0) return { aged: 0, years: 0 };

  const characterIds = db
    .prepare('SELECT DISTINCT character_id FROM relationship_states WHERE playthrough_id = ?')
    .all(playthroughId)
    .map((r) => r.character_id);

  let aged = 0;
  for (const id of characterIds) {
    const row = db.prepare('SELECT age_real, age_apparent FROM characters WHERE id = ?').get(id);
    const real = Number.parseInt(row?.age_real, 10);
    if (!Number.isFinite(real)) continue; // 年齢欄が空のキャラは触らない
    const apparent = Number.parseInt(row?.age_apparent, 10);
    db.prepare('UPDATE characters SET age_real = ?, age_apparent = ? WHERE id = ?').run(
      String(real + years),
      Number.isFinite(apparent) ? String(apparent + years) : row.age_apparent,
      id,
    );
    aged += 1;
  }
  return { aged, years };
}

// 跳んだ期間に何があったかをLLMに書かせ、記憶として積む。
//
// **跳躍が浮くのを防ぐのは日数ではなくこれ。** 3年後に再会したのに共有された過去が
// 何も無いと、関係だけが数字として残った他人同士の会話になる。
async function summarizeSkippedPeriod(playthroughId, world, label, characterIds) {
  const eligible = characterIds.filter((id) => canHaveMemories(id));
  if (eligible.length === 0) return { recorded: 0 };

  const lines = eligible.map((id) => {
    const name = db.prepare('SELECT name FROM characters WHERE id = ?').get(id)?.name ?? '???';
    const existing = listMemoriesForPrompt(playthroughId, id, world.memory_prompt_limit || 5);
    return `${name}：${existing.length ? existing.map((m) => m.content).join(' / ') : '（記録なし）'}`;
  });

  const prompt = [
    `物語の時間が「${label}」進みました。その間に各キャラクターと「あなた」の間に何があったかを想像して書いてください。`,
    '',
    'これまでの記憶：',
    ...lines,
    '',
    '1行につき1件、以下の形式で出力してください（キャラクター1人につき1件まで）：',
    'キャラ名|その期間の出来事',
    '',
    '出来事には次の2つを必ず含めてください：',
    '1. 誰が誰に何をしたのか。プレイヤーを指す場合は必ず「あなた」と書きます。',
    '2. その期間を経て、そのキャラクターが「あなた」をどう思うようになったか。',
    '',
    'これまでの記憶と矛盾しない内容にしてください。一文程度の短い日本語の地の文とし、改行や「|」は含めないでください。',
  ].join('\n');

  const raw = await generateChatCompletion({ messages: [{ role: 'user', content: prompt }], maxTokens: 400, temperature: 0.5 });

  const nameToId = new Map(
    eligible.map((id) => [db.prepare('SELECT name FROM characters WHERE id = ?').get(id)?.name, id]),
  );
  let recorded = 0;
  for (const line of raw.split('\n')) {
    const m = line.trim().match(/^(.+?)\|(.+)$/);
    if (!m) continue;
    const [, charName, content] = m;
    const id = nameToId.get(charName.trim());
    if (id == null || !content.trim()) continue;
    addMemory({
      playthrough_id: playthroughId,
      character_id: id,
      content: content.trim(),
      is_pinned: false,
      occurred_label: label,
      source: 'auto',
    });
    recorded += 1;
  }
  return { recorded };
}

// 跳躍の本体。advanceTime は呼び出し側(アクション)が先に済ませてある前提で、
// ここは加齢と要約だけを行う。
//
// 要約はLLMを使うので落ちうるが、**跳躍そのものは成功させる**。記憶が無いより
// 「跳べなかった」方が困るため、失敗は理由を返すだけに留める。
export async function applyTimeSkipEffects(playthroughId, world, days, label, { summarize = true } = {}) {
  // 加齢は要約の有無と無関係に行う。要約を切ったからといって時間が流れなかった
  // ことにはならない。
  const aging = applyAging(playthroughId, world, days);
  if (!summarize) return { aging, summary: { recorded: 0 }, summaryError: null };

  const characterIds = db
    .prepare('SELECT DISTINCT character_id FROM relationship_states WHERE playthrough_id = ?')
    .all(playthroughId)
    .map((r) => r.character_id);

  let summary = { recorded: 0 };
  let summaryError = null;
  try {
    summary = await summarizeSkippedPeriod(playthroughId, world, label, characterIds);
  } catch (err) {
    summaryError = err.message;
    console.error('time skip summary failed:', err);
  }
  return { aging, summary, summaryError };
}

// 「3年の間に」「40日の間に」のような、記憶に添える期間の呼び名。
export function formatSkipLabel(world, days) {
  const daysPerYear = world.days_per_season * world.season_labels.length;
  const years = Math.floor(days / daysPerYear);
  if (years >= 1) return `${years}年の間に`;
  return `${days}日の間に`;
}
