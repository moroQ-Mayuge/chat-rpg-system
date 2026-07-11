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
const EMOTION_PATTERN = /\[EMOTION:([a-zA-Z0-9_]+)\]\s*$/;
const ITEM_GRANT_PATTERN = /^ITEM_GRANT:\s*(.+)$/;

// Returns null for a blank line, otherwise one of:
//   { type: 'scene_change', description }
//   { type: 'narration', text }
//   { type: 'item_grant', itemName, categoryName, description }
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
    return { type: 'narration', text: line, emotionKey: null };
  }

  const [, tag, rest] = m;

  if (tag === 'SCENE_CHANGE') {
    return { type: 'scene_change', description: rest.trim() };
  }
  if (tag === 'NARRATION') {
    return { type: 'narration', text: rest.trim(), emotionKey: null };
  }

  const itemGrantMatch = tag.match(ITEM_GRANT_PATTERN);
  if (itemGrantMatch) {
    // "アイテム名|カテゴリ名" — the category half is optional (and falls
    // back to a default category server-side if omitted or unrecognized),
    // so a line missing it is still handled rather than misparsed.
    const [itemName, categoryName] = itemGrantMatch[1].split('|').map((s) => s.trim());
    return { type: 'item_grant', itemName, categoryName: categoryName || null, description: rest.trim() };
  }

  const emotionMatch = rest.match(EMOTION_PATTERN);
  const text = emotionMatch ? rest.slice(0, emotionMatch.index).trim() : rest.trim();
  return {
    type: 'character',
    characterName: tag,
    text,
    emotionKey: emotionMatch ? emotionMatch[1] : null,
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
