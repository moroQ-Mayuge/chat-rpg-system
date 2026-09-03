// Parses the multi-character script-format LLM output (SPEC.md 3.8):
//   [キャラ名]: セリフ本文 [EMOTION:expression_key]
//   [NARRATION]: 地の文・情景描写（任意）
//   [SCENE_CHANGE]: 場所や状況が変わった場合のみ出力（任意）
//
// parseScriptLine() parses a single already-complete line, so a caller can
// process a streaming response line-by-line as each one arrives (chat bubbles
// reveal one at a time rather than waiting for the whole response — see
// generateReply() in routes/roomSessions.js). parseScriptResponse() parses a
// full text in one pass by feeding it through the same per-line parser.

// ローカル日本語チューニングモデルが半角[ ] |の代わりに全角［］｜【】を使って
// しまう崩れは実プレイで頻出する。以降の全パターンは半角前提なので、比較の
// 前に正規化してしまえば既存ロジックを一切変えずに吸収できる。「］：」→「]:」
// だけは"]"の直後に限定し、地の文中の全角コロンには触れない(意味のある記号
// として普通に使われるため)。全角コロン単体のグローバル置換はしない。
function normalizeBracketPunctuation(line) {
  return line
    .replace(/［/g, '[')
    .replace(/］/g, ']')
    .replace(/｜/g, '|')
    .replace(/【/g, '[')
    .replace(/】/g, ']')
    .replace(/\]：/g, ']:');
}

const LINE_PATTERN = /^\[(.+?)\]:\s*(.*)$/;
// Fallback for a model putting the name outside the brackets and the
// emotion tag inside instead of the reverse, e.g. "陽葵[困り顔]: ..." instead
// of "[陽葵]: ... [EMOTION:smile]" -- observed live with longer/compound
// character names. Only tried when LINE_PATTERN doesn't match.
const NAME_THEN_BRACKET_PATTERN = /^([^[\]:]+?)\[(.+?)\]:\s*(.*)$/;
const BRACKET_ONLY_PATTERN = /^\[(.+?)\]\s*$/;
const EMOTION_PATTERN = /\[EMOTION:([a-zA-Z0-9_]+)\]\s*$/;
// Tried only when the strict form doesn't match, to catch a garbled keyword
// ("[E_M_O_T_I_O_N:smile]"). Capture 1 is the keyword, 2 the key.
const EMOTION_LOOSE_PATTERN = /\[([A-Za-z0-9_ .-]+):([a-zA-Z0-9_]+)\]\s*$/;
const EMOTION_KEY_ONLY_PATTERN = /^EMOTION:([a-zA-Z0-9_]+)$/i;
// Optional trailing pose tag, placed after EMOTION when present (e.g.
// "[EMOTION:smile] [POSE:sitting]"). Unlike EMOTION this is never required —
// the model only emits it when a character's pose actually changes (see
// promptBuilder.js's system-prompt instruction), so there's no loose/garbled
// fallback matching like EMOTION_LOOSE_PATTERN: an unrecognized/garbled
// attempt is simply left as no pose change rather than being force-parsed.
const POSE_PATTERN = /\[POSE:([a-zA-Z0-9_]+)\]\s*$/;
const ITEM_GRANT_PATTERN = /^ITEM_GRANT:\s*(.+)$/;
const OUTFIT_GRANT_PATTERN = /^OUTFIT_GRANT:\s*(.+)$/;
const STAT_CHANGE_PATTERN = /^STAT_CHANGE:\s*(.+)$/;
const CRAFT_RESULT_PATTERN = /^CRAFT_RESULT:\s*(.+)$/;

// Models garble these fixed keywords surprisingly often, spelling NARRATION as
// "NARR_N_A_T_I_O_N" and the like. Matching them strictly meant such a line
// fell through to the character branch, failed participant lookup, and got
// persisted verbatim — bracket text and all — via the hallucinated-name
// fallback in roomSessions.js, which is exactly what showed up on screen.
//
// Dropping everything but letters and digits absorbs the separators the model
// inserts; the edit-distance pass then covers what's left (that example
// normalizes to NARRNATION, one deletion away from NARRATION).
function normalizeTagWord(value) {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

// Control tags are always ASCII keywords, so anything containing Japanese is a
// character name and must never be fuzzy-matched into one — otherwise a name
// could be swallowed as narration. The distance allowance is small relative to
// the keywords' length, so unrelated ASCII names don't collide either.
const TAG_FUZZ_MAX_DISTANCE = 2;

function isTagLike(rawTag, keyword) {
  if (/[^\x00-\x7F]/.test(rawTag)) return false;
  const normalized = normalizeTagWord(rawTag);
  if (!normalized) return false;
  const target = normalizeTagWord(keyword);
  if (normalized === target) return true;
  return editDistance(normalized, target) <= TAG_FUZZ_MAX_DISTANCE;
}

// isTagLikeと違い行全体からの部分一致で、タグ境界(括弧・コロン)が完全に崩れて
// LINE_PATTERN等が丸ごとマッチしなかった行にも使える最終セーフティ。記号・
// 空白・日本語を削ぎ落として比較するだけなので全角/半角や区切り方は問わない。
// 編集距離を使わないのは、ここで緩めすぎると意図的な地の文を誤検知するため
// (「タグらしき文字列が残っているか」の有無だけを見る)。
export function lineContainsKeywordTrace(line, keyword) {
  return normalizeTagWord(line).includes(normalizeTagWord(keyword));
}

const KNOWN_TAG_KEYWORDS = ['ITEM_GRANT', 'OUTFIT_GRANT', 'CRAFT_RESULT', 'STAT_CHANGE', 'SCENE_CHANGE'];

// CRAFT_RESULTの3項目目(消費型/永続型)。省略・未知語は null = 「判定なし」で、
// アイテムのカテゴリ設定にそのまま従わせる(itemsRepo.jsのis_consumable上書きが
// nullable なのはこのため) —— 曖昧な語を勝手にどちらかへ倒さない。
//
// 「消費型」だけを見ていた頃は、モデルが「消耗品」「使い切り」等と書くたびに
// 判定なし扱いになり、料理が消耗品にならないケースが出ていた(実プレイでの
// 指摘)。表記ゆれを広めに拾う。永続側を先に見るのは「消費しない」のような
// 否定形で消費側に誤判定させないため。
const PERMANENT_WORDS = ['永続', '永久', '恒久', '非消耗', '非消費', 'いいえ', 'no', 'false', 'permanent'];
const CONSUMABLE_WORDS = ['消費', '消耗', '使い切り', '使いきり', '一回限り', '使うと無くな', '使うとなくな', 'はい', 'yes', 'true', 'consumable'];

export function parseConsumableWord(word) {
  if (!word) return null;
  const normalized = word.trim().toLowerCase();
  if (!normalized) return null;
  if (PERMANENT_WORDS.some((w) => normalized.includes(w))) return false;
  if (CONSUMABLE_WORDS.some((w) => normalized.includes(w))) return true;
  return null;
}

// CRAFT_RESULTの4項目目(個数)。材料が大量な時や「クッキーが何枚も焼けた」等、
// 複数個できるのが自然な場合にモデルが指定する。上限を掛けるのは、桁を誤った
// 出力(1000個等)がそのまま所持数になるのを防ぐため。
const MAX_CRAFT_QUANTITY = 99;

export function parseCraftQuantity(word) {
  if (!word) return 1;
  const matched = word.match(/\d+/);
  if (!matched) return 1;
  const parsed = parseInt(matched[0], 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, MAX_CRAFT_QUANTITY);
}

// "完成品名|カテゴリ名|消費型|個数" — ITEM_GRANTの2項目に、消費型判定と個数を
// 足した形。後ろ2つは省略可(個数の既定は1)。
//
// モデルがカテゴリ名を落として "完成品名|消費型" と書いてくることがあり、その
// まま読むと消費型判定が丸ごと失われる(カテゴリ名として解釈され、実在しない
// ので未分類=永続型に落ちる)。2項目目が消費型/永続型の語そのものなら、カテゴリ
// ではなく判定として拾い直す。個数も同様に、どの位置に来ても数値だけの項目は
// 個数として扱う。
function parseCraftPayload(payload) {
  const parts = payload.split('|').map((s) => s.trim());
  const [itemName, ...rest] = parts;

  let categoryName = null;
  let isConsumable = null;
  let quantity = 1;

  for (const part of rest) {
    if (!part) continue;
    const consumable = parseConsumableWord(part);
    if (consumable !== null) {
      if (isConsumable === null) isConsumable = consumable;
      continue;
    }
    if (/^\D*\d+\D*$/.test(part)) {
      quantity = parseCraftQuantity(part);
      continue;
    }
    if (categoryName === null) categoryName = part;
  }

  return { type: 'craft_result', itemName, categoryName, isConsumable, quantity };
}

// For the tags that carry a payload after a colon ("ITEM_GRANT: 鍵|道具"):
// only the keyword half is matched loosely, the payload is passed through
// untouched for the existing parsing below.
function matchPayloadTag(tag, keyword) {
  const idx = tag.indexOf(':');
  if (idx === -1) return null;
  if (!isTagLike(tag.slice(0, idx), keyword)) return null;
  const payload = tag.slice(idx + 1).trim();
  return payload || null;
}

// Returns null for a blank line, otherwise one of:
//   { type: 'scene_change', description }
//   { type: 'narration', text }
//   { type: 'item_grant', itemName, categoryName, description }
//   { type: 'outfit_grant', outfitMasterName, description }
//   { type: 'craft_result', itemName, categoryName, isConsumable, quantity, description }
//   { type: 'stat_change', characterName, axisName, delta }
//   { type: 'character', characterName, text, emotionKey }
// A line with no recognizable [Tag]: prefix is treated as its own narration
// turn (rather than merged into a previous turn) — necessary for incremental
// parsing, since an earlier turn may already have been persisted/broadcast
// by the time a stray line shows up.
export function parseScriptLine(rawLine) {
  const line = normalizeBracketPunctuation((rawLine || '').trim());
  if (!line) return null;

  const m = line.match(LINE_PATTERN);
  if (!m) {
    // A payload tag on its own with no trailing colon. The system prompt
    // actually instructs this shape for STAT_CHANGE ("[STAT_CHANGE: 名|軸|+1]")
    // while LINE_PATTERN requires "]:", so a model following our own
    // instruction produced a line that fell through and got shown to the
    // player as raw narration text. Restricted to the payload control tags so
    // ordinary text starting with a bracket still parses as before.
    const bare = line.match(BRACKET_ONLY_PATTERN);
    if (bare) {
      const statPayload = bare[1].match(STAT_CHANGE_PATTERN)?.[1] ?? matchPayloadTag(bare[1], 'STAT_CHANGE');
      if (statPayload) {
        const [characterName, axisName, deltaStr] = statPayload.split('|').map((s) => s.trim());
        const delta = deltaStr != null ? parseInt(deltaStr, 10) : NaN;
        return { type: 'stat_change', characterName, axisName, delta: Number.isNaN(delta) ? null : delta };
      }
      const itemPayload = bare[1].match(ITEM_GRANT_PATTERN)?.[1] ?? matchPayloadTag(bare[1], 'ITEM_GRANT');
      if (itemPayload) {
        const [itemName, categoryName] = itemPayload.split('|').map((s) => s.trim());
        return { type: 'item_grant', itemName, categoryName: categoryName || null, description: '' };
      }
      const outfitPayload = bare[1].match(OUTFIT_GRANT_PATTERN)?.[1] ?? matchPayloadTag(bare[1], 'OUTFIT_GRANT');
      if (outfitPayload) {
        return { type: 'outfit_grant', outfitMasterName: outfitPayload.trim(), description: '' };
      }
      const craftPayload = bare[1].match(CRAFT_RESULT_PATTERN)?.[1] ?? matchPayloadTag(bare[1], 'CRAFT_RESULT');
      if (craftPayload) {
        return { ...parseCraftPayload(craftPayload), description: '' };
      }
    }
    const alt = line.match(NAME_THEN_BRACKET_PATTERN);
    if (alt) {
      const [, name, bracketContent, rest] = alt;
      const emotionKeyMatch = bracketContent.trim().match(EMOTION_KEY_ONLY_PATTERN);
      return {
        type: 'character',
        characterName: name.trim(),
        text: rest.trim(),
        emotionKey: emotionKeyMatch ? emotionKeyMatch[1] : bracketContent.trim() || null,
        poseKey: null,
      };
    }
    // 正規化しても尚どのパターンにも一致しなかった行。既知タグの痕跡が残って
    // いれば(全角崩れの吸収漏れ・タグ名自体の編集距離オーバー等)、実害調査の
    // 手がかりとしてログに残す——表示内容はこれまでどおり変更しない。
    const suspectedTag = KNOWN_TAG_KEYWORDS.find((k) => lineContainsKeywordTrace(line, k));
    if (suspectedTag) {
      console.warn(`[responseParser] ${suspectedTag}らしき行がパースできませんでした: ${line}`);
    }
    return { type: 'narration', text: line, emotionKey: null };
  }

  const [, tag, rest] = m;

  // Payload-carrying tags are checked first: their keyword half would also
  // satisfy the bare-keyword checks below on a badly mangled line.
  const itemGrantPayload = tag.match(ITEM_GRANT_PATTERN)?.[1] ?? matchPayloadTag(tag, 'ITEM_GRANT');
  if (itemGrantPayload) {
    // "アイテム名|カテゴリ名" — the category half is optional (and falls
    // back to a default category server-side if omitted or unrecognized),
    // so a line missing it is still handled rather than misparsed.
    const [itemName, categoryName] = itemGrantPayload.split('|').map((s) => s.trim());
    return { type: 'item_grant', itemName, categoryName: categoryName || null, description: rest.trim() };
  }

  const outfitGrantPayload = tag.match(OUTFIT_GRANT_PATTERN)?.[1] ?? matchPayloadTag(tag, 'OUTFIT_GRANT');
  if (outfitGrantPayload) {
    // 衣装マスタは名前だけで解決する厳選プリセット(ITEM_GRANTと違いカテゴリ指定は無い)。
    return { type: 'outfit_grant', outfitMasterName: outfitGrantPayload.trim(), description: rest.trim() };
  }

  const craftResultPayload = tag.match(CRAFT_RESULT_PATTERN)?.[1] ?? matchPayloadTag(tag, 'CRAFT_RESULT');
  if (craftResultPayload) {
    return { ...parseCraftPayload(craftResultPayload), description: rest.trim() };
  }

  const statChangePayload = tag.match(STAT_CHANGE_PATTERN)?.[1] ?? matchPayloadTag(tag, 'STAT_CHANGE');
  if (statChangePayload) {
    // "キャラ名|軸名|符号付き整数" — same "|"-delimited shape as ITEM_GRANT.
    // A malformed/non-numeric third field yields delta:null so the caller
    // (roomSessions.js) can silently ignore the line rather than misapply it.
    const [characterName, axisName, deltaStr] = statChangePayload.split('|').map((s) => s.trim());
    const delta = deltaStr != null ? parseInt(deltaStr, 10) : NaN;
    return { type: 'stat_change', characterName, axisName, delta: Number.isNaN(delta) ? null : delta };
  }

  if (isTagLike(tag, 'SCENE_CHANGE')) {
    return { type: 'scene_change', description: rest.trim() };
  }
  if (isTagLike(tag, 'NARRATION')) {
    return { type: 'narration', text: rest.trim(), emotionKey: null };
  }

  // POSE (if present) sits to the right of EMOTION, so it's stripped first.
  const poseMatch = rest.match(POSE_PATTERN);
  const poseKey = poseMatch ? poseMatch[1] : null;
  const restAfterPose = poseMatch ? rest.slice(0, poseMatch.index).trim() : rest;

  // Same garbling can hit the trailing emotion tag, which would otherwise
  // leave "[E_M_O_T_I_O_N:smile]" sitting in the dialogue text. The key itself
  // stays strict — an unknown one is folded into the line by roomSessions.js.
  const emotionMatch = restAfterPose.match(EMOTION_PATTERN) ?? restAfterPose.match(EMOTION_LOOSE_PATTERN);
  const emotionKey = emotionMatch && (emotionMatch.length > 2 ? isTagLike(emotionMatch[1], 'EMOTION') : true)
    ? emotionMatch[emotionMatch.length - 1]
    : null;
  const text = emotionMatch && emotionKey ? restAfterPose.slice(0, emotionMatch.index).trim() : restAfterPose.trim();
  return {
    type: 'character',
    characterName: tag,
    text,
    emotionKey,
    poseKey,
  };
}

export function parseScriptResponse(rawText) {
  const lines = (rawText || '').split('\n');

  const turns = [];
  let sceneChange = null;

  for (const line of lines) {
    const parsed = parseScriptLine(line);
    if (!parsed) continue;

    if (parsed.type === 'scene_change') {
      sceneChange = parsed.description;
      continue;
    }
    turns.push(parsed);
  }

  return { turns, sceneChange };
}
