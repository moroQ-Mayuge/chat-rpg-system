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
const ITEM_GRANT_PATTERN = /^ITEM_GRANT:\s*(.+)$/;
const STAT_CHANGE_PATTERN = /^STAT_CHANGE:\s*(.+)$/;

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
//   { type: 'stat_change', characterName, axisName, delta }
//   { type: 'character', characterName, text, emotionKey }
// A line with no recognizable [Tag]: prefix is treated as its own narration
// turn (rather than merged into a previous turn) — necessary for incremental
// parsing, since an earlier turn may already have been persisted/broadcast
// by the time a stray line shows up.
export function parseScriptLine(rawLine) {
  const line = (rawLine || '').trim();
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
      };
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

  // Same garbling can hit the trailing emotion tag, which would otherwise
  // leave "[E_M_O_T_I_O_N:smile]" sitting in the dialogue text. The key itself
  // stays strict — an unknown one is folded into the line by roomSessions.js.
  const emotionMatch = rest.match(EMOTION_PATTERN) ?? rest.match(EMOTION_LOOSE_PATTERN);
  const emotionKey = emotionMatch && (emotionMatch.length > 2 ? isTagLike(emotionMatch[1], 'EMOTION') : true)
    ? emotionMatch[emotionMatch.length - 1]
    : null;
  const text = emotionMatch && emotionKey ? rest.slice(0, emotionMatch.index).trim() : rest.trim();
  return {
    type: 'character',
    characterName: tag,
    text,
    emotionKey,
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
