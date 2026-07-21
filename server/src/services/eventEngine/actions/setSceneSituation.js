import { db } from '../../../db/connection.js';
import { resolveTargetToken, buildParticipantsByName } from '../placeholderResolution.js';
import { resolveMentionedList } from '../mentionResolution.js';

// { text: string } -- persists a free-text "current scene situation" onto
// the room_sessions row (room-session-scoped: naturally resets on room
// move/new session, see 0052_scene_situation.sql), surfaced to the LLM by
// buildSystemPrompt. Supports the same ${target1}/${target2}/${キャラ名}
// placeholder syntax as generate_image's prompt_override / insert_dialogue's
// fixed text, resolved to display names (see placeholderResolution.js).
export function executeSetSceneSituation(params, execCtx) {
  const { text = '' } = params;
  const participants = execCtx.session.participants;
  const participantsByName = buildParticipantsByName(participants);
  const mentionedIds = resolveMentionedList(execCtx.mentionedCharacterIds, null);
  const candidateParticipants = mentionedIds.length > 0 ? mentionedIds.map((id) => participants.find((p) => p.character_id === id)).filter(Boolean) : participants;

  const resolvedText = text.replace(/\$\{([^}]+)\}/g, (match, token) => {
    const { participant } = resolveTargetToken(token, candidateParticipants, participantsByName);
    return participant ? participant.name : '';
  });

  db.prepare('UPDATE room_sessions SET current_scene_situation = ? WHERE id = ?').run(resolvedText, execCtx.sessionId);
  return { current_scene_situation: resolvedText };
}
