// モデル評価の採点器。全て決定的な純関数で、同じ入力からは必ず同じスコアが出る
// （LLM-as-judgeを採らないのは、審査役モデルへの切替で実行時間が跳ね上がるうえ、
//  判定の信頼性自体がローカルLLMの能力に依存してしまうため）。
//
// 各採点器は ctx を受け取り { score: 0..1, detail: string } を返す。
// ctx = { rawText, lines, resolver, participants, protagonist, characters,
//         assertion, prevOutput, latencyMs, promptTokens }
//   lines        … parseScriptLineの結果(空行除く)。本番と同じ解釈で評価する
//   resolver     … buildParticipantResolver()の結果。本番と同じ話者解決規則
//   characters   … character_id -> 実効キャラ(promptBuilderと同じく変身名・
//                  呼び方進行を反映済み)のMap
//   assertion    … シナリオのターン定義(expect_keywords等)
import { isRefusalText } from '../refusalDetection.js';

// スコア0..1に丸める。採点器が計算をミスしても集計側が壊れないようにする保険。
function clamp(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function characterLines(lines) {
  return lines.filter((l) => l.type === 'character');
}

// 台詞本文だけを取り出す。制御タグ(EMOTION/POSE等)はparseScriptLineが既に
// 剥がしているので、ここでは地の文と台詞を結合するだけでよい。
function spokenText(lines) {
  return lines
    .filter((l) => l.type === 'character' || l.type === 'narration')
    .map((l) => l.text ?? '')
    .join('\n');
}

// ── 1. 出力フォーマット堅牢性 ────────────────────────────────
// 各行が既知の型に解釈でき、話者が解決でき、EMOTIONタグが付いているか。
export function scoreFormat(ctx) {
  const { lines, resolver, validEmotionKeys } = ctx;
  if (lines.length === 0) return { score: 0, detail: '出力が空、または1行も解釈できなかった' };

  const problems = [];
  let points = 0;
  for (const line of lines) {
    if (line.type === 'character') {
      const resolved = resolver.resolve(line.characterName);
      if (!resolved) {
        problems.push(`話者「${line.characterName}」が解決不能`);
        continue;
      }
      // EMOTIONは全キャラ行で必須(システムプロンプトがそう指示している)
      if (!line.emotionKey) {
        problems.push(`「${line.characterName}」にEMOTIONタグ無し`);
        points += 0.5;
      } else if (validEmotionKeys && !validEmotionKeys.has(line.emotionKey)) {
        problems.push(`未登録の感情キー「${line.emotionKey}」`);
        points += 0.7;
      } else {
        points += 1;
      }
    } else {
      // narration/scene_change/各種タグ行は形式として正しい
      points += 1;
    }
  }
  return {
    score: clamp(points / lines.length),
    detail: problems.length ? problems.join(' / ') : `${lines.length}行すべて正常`,
  };
}

// ── 2. システム適応度（制御タグの正しさ） ──────────────────────
export function scoreSystemFit(ctx) {
  const { lines, assertion, validEmotionKeys, validPoseKeys } = ctx;
  const problems = [];
  let checks = 0;
  let passed = 0;

  for (const line of characterLines(lines)) {
    if (line.emotionKey) {
      checks += 1;
      if (validEmotionKeys?.has(line.emotionKey)) passed += 1;
      else problems.push(`感情キー「${line.emotionKey}」は未登録`);
    }
    if (line.poseKey) {
      checks += 1;
      if (validPoseKeys?.has(line.poseKey)) passed += 1;
      else problems.push(`ポーズキー「${line.poseKey}」は未登録`);
    }
  }

  // シナリオが特定の制御タグを要求している場合(例: CRAFT_RESULT)
  const expectTags = assertion?.expect_tags ?? [];
  const typeByTag = {
    ITEM_GRANT: 'item_grant',
    OUTFIT_GRANT: 'outfit_grant',
    CRAFT_RESULT: 'craft_result',
    STAT_CHANGE: 'stat_change',
    SCENE_CHANGE: 'scene_change',
  };
  for (const tag of expectTags) {
    checks += 1;
    if (lines.some((l) => l.type === typeByTag[tag])) passed += 1;
    else problems.push(`要求された${tag}が出ていない`);
  }

  if (checks === 0) return { score: 1, detail: '検査対象の制御タグ無し（減点なし）' };
  return { score: clamp(passed / checks), detail: problems.length ? problems.join(' / ') : `制御タグ${checks}件すべて妥当` };
}

// ── 3. キャラ設定の再現性 ────────────────────────────────────
// 語尾は「～だよ／～かな」のように区切り記号で複数指定されることがあり、
// 先頭の波ダッシュも全角/半角(～/〜)が混在する。どれか1つ現れれば良しとする。
function sentenceEndingVariants(raw) {
  return (raw || '')
    .split(/[／/、,・|]/)
    .map((s) => s.trim().replace(/^[～〜~]+/, '').trim())
    .filter((s) => s.length > 0);
}

// call_user_asは「名前に「さん」付け」のような“説明文”が入っていることがあり、
// その場合は literal として照合できない。説明文らしきものは検査対象から外す。
function isLiteralAddress(value) {
  const v = (value || '').trim();
  if (!v || v.length > 8) return false;
  return !/[「」『』]/.test(v) && !/(付け|づけ|呼ぶ|呼び|など|その他)/.test(v);
}

// 一人称は表記ゆれ(私/わたし/ワタシ)を同一視して扱う。
const FIRST_PERSON_GROUPS = [
  ['私', 'わたし', 'ワタシ'],
  ['わたくし', 'ワタクシ'],
  ['あたし', 'アタシ'],
  ['僕', 'ぼく', 'ボク'],
  ['俺', 'おれ', 'オレ'],
  ['うち', 'ウチ'],
  ['自分'],
  ['わし', 'ワシ'],
  ['拙者'],
];

// 「一人称が出ていない」ことは減点しない——短い相槌に一人称が出ないのは自然で、
// それを減点するとどのモデルも一様に下がるだけで比較の役に立たない。
// 見るのは「設定と“違う”一人称を使っていないか」＝実際のキャラ崩壊のみ。
// 戻り値: true=正しい / false=別の一人称を使った / null=判定対象外
function checkFirstPerson(text, firstPerson) {
  const stem = (firstPerson || '').trim().replace(/[はがもをのにへとや]$/, '');
  if (!stem) return null;
  const ownGroup = FIRST_PERSON_GROUPS.find((g) => g.includes(stem)) ?? [stem];
  if (ownGroup.some((v) => text.includes(v))) return true;
  const otherUsed = FIRST_PERSON_GROUPS.filter((g) => g !== ownGroup)
    .flat()
    .filter((v) => text.includes(v));
  return otherUsed.length > 0 ? false : null;
}

export function scoreCharacterFidelity(ctx) {
  const { lines, resolver, characters } = ctx;
  const speaking = characterLines(lines);
  if (speaking.length === 0) return { score: 0, detail: 'キャラの台詞が1行も無い' };

  // 同じキャラの複数行はまとめて評価する(1行ごとに一人称が出るとは限らないため)
  const textByCharacterId = new Map();
  for (const line of speaking) {
    const p = resolver.resolve(line.characterName);
    if (!p) continue;
    textByCharacterId.set(p.character_id, `${textByCharacterId.get(p.character_id) ?? ''}\n${line.text ?? ''}`);
  }
  if (textByCharacterId.size === 0) return { score: 0, detail: '解決できた話者が居ない' };

  const problems = [];
  let checks = 0;
  let passed = 0;
  for (const [characterId, text] of textByCharacterId) {
    const ch = characters.get(characterId);
    if (!ch) continue;
    const label = ch.name ?? `#${characterId}`;

    const firstPersonOk = checkFirstPerson(text, ch.first_person);
    if (firstPersonOk !== null) {
      checks += 1;
      if (firstPersonOk) passed += 1;
      else problems.push(`${label}: 設定と異なる一人称（設定は「${ch.first_person}」）`);
    }

    // 語尾も同様に、ある程度の長さがある台詞でのみ検査する(相槌1行に語尾が
    // 出ないのは自然なため)。
    const endings = sentenceEndingVariants(ch.sentence_ending);
    if (endings.length > 0 && text.replace(/\s/g, '').length >= 20) {
      checks += 1;
      if (endings.some((e) => text.includes(e))) passed += 1;
      else problems.push(`${label}: 語尾「${ch.sentence_ending}」が出ていない`);
    }

    // 呼び方も語尾と同じ長さゲートを掛ける。「……何だと？」のような短い台詞に
    // 呼びかけが入らないのは自然で、そこを減点するとどのモデルも一様に下がり
    // 比較の役に立たない(実走で実際に誤検出したため追加した条件)。
    if (isLiteralAddress(ch.call_user_as) && text.replace(/\s/g, '').length >= 20) {
      checks += 1;
      if (text.includes(ch.call_user_as.trim())) passed += 1;
      else problems.push(`${label}: 呼び方「${ch.call_user_as}」が出ていない`);
    }
  }

  if (checks === 0) return { score: 1, detail: '照合可能な口調設定が無い（減点なし）' };
  return { score: clamp(passed / checks), detail: problems.length ? problems.join(' / ') : '一人称・語尾・呼び方すべて再現' };
}

// ── 4. ユーザー指示への追従性 ────────────────────────────────
export function scoreInstruction(ctx) {
  const { assertion } = ctx;
  const expected = assertion?.expect_keywords ?? [];
  if (expected.length === 0) return { score: 1, detail: '指定キーワード無し（減点なし）' };
  const text = spokenText(ctx.lines);
  const missing = expected.filter((k) => !text.includes(k));
  return {
    score: clamp((expected.length - missing.length) / expected.length),
    detail: missing.length ? `未出現: ${missing.join('、')}` : `指定語${expected.length}件すべて出現`,
  };
}

// 日本語の拒絶は肯定語を否定形で含むことが多い（「許す道理はない」「いいよとは
// 言えない」）。素朴な部分一致だと、完全な拒絶を「肯定的な語が出た」と誤判定して
// しまうため、直後に否定表現が続く出現は数えない。
// 逆向きにも効かせる：「嫌じゃない」を拒絶として数えてしまわないようにする。
const NEGATION_MARKERS = ['ない', 'なく', 'ねえ', 'ねぇ', 'ぬ', 'ません', 'まい', 'ものか', 'わけが', 'はずが', 'とは言え'];

function hasAffirmativeOccurrence(text, keyword) {
  let from = 0;
  for (;;) {
    const idx = text.indexOf(keyword, from);
    if (idx === -1) return false;
    // 直後8文字以内に否定表現が無ければ「肯定的にその語を使った」と見る
    const tail = text.slice(idx + keyword.length, idx + keyword.length + 8);
    if (!NEGATION_MARKERS.some((m) => tail.includes(m))) return true;
    from = idx + keyword.length;
  }
}

// ── 5. ネガティブ文脈の適応性 ────────────────────────────────
// 「嫌がる場面で肯定的に転ばないか」。禁止語の不在と拒絶語の出現を両方見る。
export function scoreNegativeContext(ctx) {
  const { assertion } = ctx;
  const forbidden = assertion?.forbid_keywords ?? [];
  const refusalMarkers = assertion?.expect_refusal_by ?? [];
  if (forbidden.length === 0 && refusalMarkers.length === 0) {
    return { score: 1, detail: 'ネガティブ文脈の指定無し（減点なし）' };
  }
  const text = spokenText(ctx.lines);
  const problems = [];
  let checks = 0;
  let passed = 0;

  if (forbidden.length > 0) {
    checks += 1;
    const hit = forbidden.filter((k) => hasAffirmativeOccurrence(text, k));
    if (hit.length === 0) passed += 1;
    else problems.push(`肯定的な語が出現: ${hit.join('、')}`);
  }
  if (refusalMarkers.length > 0) {
    checks += 1;
    if (refusalMarkers.some((k) => hasAffirmativeOccurrence(text, k))) passed += 1;
    else problems.push('拒絶を示す語が1つも出ていない');
  }
  return { score: clamp(passed / checks), detail: problems.length ? problems.join(' / ') : '拒絶が維持されている' };
}

// ── 6. 日本語以外の混入 ──────────────────────────────────────
// ハングル/キリル/タイ/アラビアは即失格。ラテン文字は3文字以上の連続を減点する
// (OK・TV のような短い借用語や、感嘆符・数字は許容する)。
const HARD_FOREIGN = /[가-힯ᄀ-ᇿЀ-ӿ฀-๿؀-ۿ]/;
const LATIN_RUN = /[A-Za-z]{3,}/g;

export function scoreLanguagePurity(ctx) {
  const text = spokenText(ctx.lines);
  if (!text.trim()) return { score: 0, detail: '本文が空' };
  if (HARD_FOREIGN.test(text)) {
    return { score: 0, detail: '日本語以外の文字体系（ハングル/キリル等）が混入' };
  }
  const runs = text.match(LATIN_RUN) ?? [];
  if (runs.length === 0) return { score: 1, detail: '日本語のみ' };
  // 文字数比で減点。半分以上がラテン文字なら0点になる。
  const latinChars = runs.join('').length;
  const ratio = latinChars / text.replace(/\s/g, '').length;
  return {
    score: clamp(1 - ratio * 2),
    detail: `英字混入: ${[...new Set(runs)].slice(0, 5).join('、')}（本文の${Math.round(ratio * 100)}%）`,
  };
}

// ── 7. 固定文言の維持 ────────────────────────────────────────
export function scoreFixedStrings(ctx) {
  const { assertion } = ctx;
  const fixed = assertion?.fixed_strings ?? [];
  if (fixed.length === 0) return { score: 1, detail: '固定文言の指定無し（減点なし）' };
  const text = ctx.rawText;
  const missing = fixed.filter((s) => !text.includes(s));
  return {
    score: clamp((fixed.length - missing.length) / fixed.length),
    detail: missing.length ? `そのまま出ていない: ${missing.join('、')}` : `固定文言${fixed.length}件すべて維持`,
  };
}

// ── 8. 話者の同一性 ──────────────────────────────────────────
// 存在しない/退室済みキャラの台詞を書いていないか。expect_speakersがあれば
// 「話すべきキャラが実際に話したか」も見る。
export function scoreSpeakerIntegrity(ctx) {
  const { lines, resolver, assertion, departedNames } = ctx;
  const speaking = characterLines(lines);
  const problems = [];
  let checks = 0;
  let passed = 0;

  if (speaking.length > 0) {
    checks += 1;
    const ghosts = speaking.map((l) => l.characterName).filter((n) => !resolver.resolve(n));
    const departed = speaking.map((l) => l.characterName).filter((n) => departedNames?.has(n));
    if (ghosts.length === 0 && departed.length === 0) passed += 1;
    else {
      if (ghosts.length) problems.push(`不在キャラの発言: ${[...new Set(ghosts)].join('、')}`);
      if (departed.length) problems.push(`退室済みキャラの発言: ${[...new Set(departed)].join('、')}`);
    }
  }

  const expectSpeakers = assertion?.expect_speakers ?? [];
  if (expectSpeakers.length > 0) {
    checks += 1;
    const spoke = new Set(
      speaking.map((l) => resolver.resolve(l.characterName)?.name).filter(Boolean),
    );
    const silent = expectSpeakers.filter((n) => !spoke.has(n));
    if (silent.length === 0) passed += 1;
    else problems.push(`発言が無い: ${silent.join('、')}`);
  }

  if (checks === 0) {
    // 地の文だけのターン。破綻ではないが、会話が進んでいないので満点にはしない。
    const narrationOnly = lines.some((l) => l.type === 'narration');
    return narrationOnly
      ? { score: 0.5, detail: 'キャラの台詞が無く地の文のみ' }
      : { score: 0, detail: 'キャラの台詞が1行も無い' };
  }
  return { score: clamp(passed / checks), detail: problems.length ? problems.join(' / ') : '話者はすべて妥当' };
}

// ── 9. 主人公の乗っ取り ──────────────────────────────────────
// システムプロンプトが明示的に禁じている「プレイヤーの発言を先取りして書く」。
export function scoreProtagonistIntrusion(ctx) {
  const { lines, protagonist } = ctx;
  const names = [protagonist?.name, protagonist?.nickname].map((s) => (s || '').trim()).filter(Boolean);
  if (names.length === 0) return { score: 1, detail: '主人公名が未設定（検査対象外）' };
  const hits = characterLines(lines)
    .map((l) => l.characterName)
    .filter((n) => names.some((pn) => n === pn || n.includes(pn)));
  if (hits.length === 0) return { score: 1, detail: '主人公の台詞は書かれていない' };
  return { score: 0, detail: `主人公として発言している: ${[...new Set(hits)].join('、')}` };
}

// ── 10. 拒否・メタ発言 ───────────────────────────────────────
const META_PHRASES = ['ai として', 'aiとして', '言語モデル', 'アシスタントとして', 'ロールプレイを続け', 'システムプロンプト'];

export function scoreRefusalMeta(ctx) {
  const { rawText } = ctx;
  if (isRefusalText(rawText)) return { score: 0, detail: '拒否文が検出された（refusalDetection.js）' };
  const lowered = rawText.toLowerCase();
  const meta = META_PHRASES.filter((p) => lowered.includes(p));
  if (meta.length > 0) return { score: 0, detail: `メタ発言: ${meta.join('、')}` };
  return { score: 1, detail: '拒否・メタ発言なし' };
}

// ── 11. 繰り返し率 ──────────────────────────────────────────
// 直前ターンとの文字4-gram重なり。高いほど「同じことを言い続けている」。
function ngrams(text, n = 4) {
  const cleaned = text.replace(/\s/g, '');
  const set = new Set();
  for (let i = 0; i + n <= cleaned.length; i += 1) set.add(cleaned.slice(i, i + n));
  return set;
}

export function scoreRepetition(ctx) {
  const { lines, prevOutput } = ctx;
  const current = spokenText(lines);
  if (!prevOutput || !current.trim()) return { score: 1, detail: '比較対象の前ターン無し（減点なし）' };
  const a = ngrams(current);
  const b = ngrams(prevOutput);
  if (a.size === 0 || b.size === 0) return { score: 1, detail: '比較できる長さが無い' };
  let shared = 0;
  for (const g of a) if (b.has(g)) shared += 1;
  const overlap = shared / a.size;
  return {
    score: clamp(1 - overlap),
    detail: `前ターンとの重なり ${Math.round(overlap * 100)}%`,
  };
}

// ── 12. 応答形状 ────────────────────────────────────────────
export function scoreResponseShape(ctx) {
  const { lines, rawText } = ctx;
  const text = spokenText(lines);
  const problems = [];
  let score = 1;

  if (text.replace(/\s/g, '').length < 15) {
    problems.push('応答が極端に短い');
    score -= 0.5;
  }
  // 文末が句読点・閉じ括弧・タグで終わっていなければトークン上限での途切れを疑う
  if (rawText.trim() && !/[。．！？!?」』）\)\]…ー~〜]\s*$/.test(rawText.trim())) {
    problems.push('文末が途切れている可能性');
    score -= 0.3;
  }
  if (lines.length === 0) {
    problems.push('解釈できる行が無い');
    score = 0;
  }
  return { score: clamp(score), detail: problems.length ? problems.join(' / ') : '長さ・終端とも妥当' };
}

// ── 13. 速度（参考値） ──────────────────────────────────────
// 品質スコアを速度で歪めないよう、既定の重みは0にしてある(WEIGHTS参照)。
export function scorePerformance(ctx) {
  const { latencyMs, rawText } = ctx;
  if (!latencyMs) return { score: 1, detail: '計測なし' };
  const charsPerSec = rawText.length / (latencyMs / 1000);
  // 20文字/秒で満点、5文字/秒で0点の線形評価(ローカルLLMの体感基準)
  return {
    score: clamp((charsPerSec - 5) / 15),
    detail: `${Math.round(latencyMs)}ms / ${charsPerSec.toFixed(1)}文字毎秒`,
  };
}

// 採点器レジストリ。キーがそのままDBのscores JSONのキーになる。
export const SCORERS = {
  format: { label: '出力フォーマット堅牢性', fn: scoreFormat },
  system_fit: { label: 'システム適応度（制御タグ）', fn: scoreSystemFit },
  fidelity: { label: 'キャラ設定の再現性', fn: scoreCharacterFidelity },
  instruction: { label: 'ユーザー指示追従性', fn: scoreInstruction },
  negative: { label: 'ネガティブ文脈の適応性', fn: scoreNegativeContext },
  language: { label: '日本語以外の混入', fn: scoreLanguagePurity },
  fixed_string: { label: '固定文言の維持', fn: scoreFixedStrings },
  speaker: { label: '話者の同一性', fn: scoreSpeakerIntegrity },
  protagonist: { label: '主人公の乗っ取り防止', fn: scoreProtagonistIntrusion },
  refusal_meta: { label: '拒否・メタ発言のなさ', fn: scoreRefusalMeta },
  repetition: { label: '繰り返しのなさ', fn: scoreRepetition },
  shape: { label: '応答形状', fn: scoreResponseShape },
  performance: { label: '速度（参考）', fn: scorePerformance },
};

// 総合スコアの既定重み。速度は0＝参考値として表示するだけで順位に影響させない。
export const DEFAULT_WEIGHTS = {
  format: 2,
  system_fit: 1.5,
  fidelity: 2,
  instruction: 1.5,
  negative: 2,
  language: 1.5,
  fixed_string: 1,
  speaker: 1.5,
  protagonist: 1,
  refusal_meta: 1.5,
  repetition: 1,
  shape: 0.5,
  performance: 0,
};

export function scoreAll(ctx) {
  const scores = {};
  for (const [key, { fn }] of Object.entries(SCORERS)) {
    try {
      const { score, detail } = fn(ctx);
      scores[key] = { score: clamp(score), detail };
    } catch (err) {
      // 1つの採点器が落ちても評価全体は続行する(結果の欠損として残す)
      scores[key] = { score: 0, detail: `採点エラー: ${err.message}` };
    }
  }
  return scores;
}

// 重み付き平均。重み0の軸は総合から除外される。
export function weightedTotal(scores, weights = DEFAULT_WEIGHTS) {
  let sum = 0;
  let weightSum = 0;
  for (const [key, weight] of Object.entries(weights)) {
    if (!weight || !scores[key]) continue;
    sum += scores[key].score * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? sum / weightSum : 0;
}
