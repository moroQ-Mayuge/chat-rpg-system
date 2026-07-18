// When 2+ session participants share the same display name (nothing stops a
// World author from casting the same character concept twice, or two
// distinct characters sharing a name), the LLM has no way to tell them apart
// in the [Name]: script format — participantsByName lookups collide and
// dialogue gets misattributed. Two distinct collision cases are handled
// differently:
//   - Same character_id repeated (mob duplication, 2026-07-18, see
//     0043_row_level_random_assignments_and_mob_duplicates.sql — the same
//     mob character can now be picked by more than one random assignment
//     row and appear as several independent participants in one session):
//     letter suffix "A", "B", "C"... appended to every occurrence after the
//     first.
//   - Different character_id, same name (two distinct characters that
//     happen to share a display name): unchanged plain "(2)"/"(3)" suffix
//     (not a special-unicode circled number, so a small local model
//     tokenizes it reliably).
// Both are deterministic based on participants' array order. Called
// identically from promptBuilder.js (so the character card the LLM sees
// already shows the disambiguated name) and roomSessions.js's
// participantsByName construction (so parsing the LLM's output resolves
// back to the correct participant) — same input array, same algorithm, so
// both naturally agree without any shared state to wire through.
function letterSuffix(occurrenceIndex) {
  // occurrenceIndex 1 (second occurrence overall) -> "A", 2 -> "B", ...
  return String.fromCharCode('A'.charCodeAt(0) + occurrenceIndex - 1);
}

export function withDisambiguatedNames(participants) {
  const nameSeen = new Map();
  const characterIdSeen = new Map();
  return participants.map((p) => {
    const characterOccurrence = (characterIdSeen.get(p.character_id) ?? 0) + 1;
    characterIdSeen.set(p.character_id, characterOccurrence);
    if (characterOccurrence > 1) {
      return { ...p, display_name: `${p.name}${letterSuffix(characterOccurrence - 1)}` };
    }
    const nameCount = (nameSeen.get(p.name) ?? 0) + 1;
    nameSeen.set(p.name, nameCount);
    return { ...p, display_name: nameCount === 1 ? p.name : `${p.name}(${nameCount})` };
  });
}
