// Resolves the "mentioned" character_id sentinel (chat-scene @mention, see
// resolveMentions() in roomSessions.js) against the ids actually mentioned
// this turn. Shared by every condition/action that offers "mentioned"
// alongside "any_present"/"all_present"/a fixed character_id.
export function resolveMentionedList(mentionedCharacterIds, limit) {
  const ids = mentionedCharacterIds ?? [];
  return typeof limit === 'number' && limit > 0 ? ids.slice(0, limit) : ids;
}

export function resolveMentionedSingle(mentionedCharacterIds) {
  return mentionedCharacterIds?.[0] ?? null;
}
