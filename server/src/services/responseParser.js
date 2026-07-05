// Parses the multi-character script-format LLM output (SPEC.md 3.8):
//   [キャラ名]: セリフ本文 [EMOTION:expression_key]
//   [NARRATION]: 地の文・情景描写（任意）
//   [SCENE_CHANGE]: 場所や状況が変わった場合のみ出力（任意）
//
// Parses the full completed text rather than incrementally, since re-segmenting
// a mid-stream partial script is far more error-prone than parsing once the
// whole response has landed.

const LINE_PATTERN = /^\[(.+?)\]:\s*(.*)$/;
const EMOTION_PATTERN = /\[EMOTION:([a-zA-Z0-9_]+)\]\s*$/;

export function parseScriptResponse(rawText) {
  const lines = (rawText || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const turns = [];
  let sceneChange = null;

  for (const line of lines) {
    const m = line.match(LINE_PATTERN);
    if (!m) {
      // Malformed/stray line with no bracket tag — append to the previous turn
      // rather than silently dropping content the model did generate.
      if (turns.length > 0) {
        turns[turns.length - 1].text += ` ${line}`;
      } else {
        turns.push({ type: 'narration', text: line, emotionKey: null });
      }
      continue;
    }

    const [, tag, rest] = m;

    if (tag === 'SCENE_CHANGE') {
      sceneChange = rest.trim();
      continue;
    }
    if (tag === 'NARRATION') {
      turns.push({ type: 'narration', text: rest.trim(), emotionKey: null });
      continue;
    }

    const emotionMatch = rest.match(EMOTION_PATTERN);
    const text = emotionMatch ? rest.slice(0, emotionMatch.index).trim() : rest.trim();
    turns.push({
      type: 'character',
      characterName: tag,
      text,
      emotionKey: emotionMatch ? emotionMatch[1] : null,
    });
  }

  return { turns, sceneChange };
}
