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

// 「モデルが書いた[名前]:を実際の参加者へ解決する」規則。完全一致を優先し、
// 外れた場合だけ部分一致へ落ちるが、候補が2人以上なら解決しない(取り違えるより
// 未解決として扱う方が安全)。
//
// roomSessions.jsの本番処理と、modelEvalの採点器の両方がこれを使う——採点が
// 「本番と同じ基準で話者を解決できたか」を測るものである以上、規則が2箇所に
// 分かれていると採点結果が本番の挙動とずれてしまうため。
export function buildParticipantResolver(participants) {
  const byName = new Map(withDisambiguatedNames(participants).map((p) => [p.display_name, p]));
  function resolve(name) {
    if (byName.has(name)) return byName.get(name);
    const candidates = [...byName.entries()].filter(
      ([displayName]) => displayName.includes(name) || name.includes(displayName),
    );
    return candidates.length === 1 ? candidates[0][1] : null;
  }
  return { byName, resolve };
}
