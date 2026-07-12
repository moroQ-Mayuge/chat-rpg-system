// When 2+ session participants share the same display name (nothing stops a
// World author from casting the same character concept twice, or two
// distinct characters sharing a name), the LLM has no way to tell them apart
// in the [Name]: script format — participantsByName lookups collide and
// dialogue gets misattributed. Appends a plain "(2)"/"(3)" suffix (not a
// special-unicode circled number, so a small local model tokenizes it
// reliably) to every occurrence after the first, deterministically based on
// participants' array order. Called identically from promptBuilder.js (so
// the character card the LLM sees already shows the disambiguated name) and
// roomSessions.js's participantsByName construction (so parsing the LLM's
// output resolves back to the correct participant) — same input array, same
// algorithm, so both naturally agree without any shared state to wire through.
export function withDisambiguatedNames(participants) {
  const seen = new Map();
  return participants.map((p) => {
    const count = (seen.get(p.name) ?? 0) + 1;
    seen.set(p.name, count);
    return { ...p, display_name: count === 1 ? p.name : `${p.name}(${count})` };
  });
}
