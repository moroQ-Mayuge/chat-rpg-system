// Shared "token -> participant" resolution for the ${target1}/${target2}/
// ${キャラ名}(.category) placeholder syntax (SPEC.md 3.6.4). Originally
// private to generateImage.js (which turns the resolved participant into
// outfit danbooru tags); factored out so insertDialogue.js can reuse the
// same token grammar to resolve a participant's display name instead.
// Positional tokens (targetN) index into candidateParticipants in the
// caller's chosen priority order (target_character_ids -> @mention -> all
// present, or a subset thereof); named tokens look up by exact
// participant.name via participantsByName.
export function resolveTargetToken(token, candidateParticipants, participantsByName) {
  const dotIndex = token.indexOf('.');
  const base = dotIndex === -1 ? token : token.slice(0, dotIndex);
  const categoryKey = dotIndex === -1 ? null : token.slice(dotIndex + 1);
  const positionalMatch = base.match(/^target(\d+)$/);
  const participant = positionalMatch
    ? candidateParticipants[Number(positionalMatch[1]) - 1]
    : participantsByName.get(base);
  return { participant, categoryKey };
}

export function buildParticipantsByName(participants) {
  return new Map(participants.map((p) => [p.name, p]));
}
