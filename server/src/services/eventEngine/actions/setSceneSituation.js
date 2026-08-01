import { db } from '../../../db/connection.js';
import { resolvePlaceholderText } from '../placeholderResolution.js';

// { text: string } -- persists a free-text "current scene situation" onto
// the room_sessions row (room-session-scoped: naturally resets on room
// move/new session, see 0052_scene_situation.sql), surfaced to the LLM by
// buildSystemPrompt. Supports the same ${target1}/${target2}/${キャラ名}
// (and ${player}/${target1.nickname}/${season}/etc.) placeholder syntax as
// insert_dialogue's fixed text, resolved to display names/values (see
// placeholderResolution.js).
export function executeSetSceneSituation(params, execCtx) {
  const { text = '' } = params;
  const resolvedText = resolvePlaceholderText(text, execCtx);
  db.prepare('UPDATE room_sessions SET current_scene_situation = ? WHERE id = ?').run(resolvedText, execCtx.sessionId);
  return { current_scene_situation: resolvedText };
}
