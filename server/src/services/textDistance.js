// Standard Levenshtein edit distance. Shared between responseParser.js (fuzzy
// control-tag keyword matching, e.g. "NARR_N_A_T_I_O_N" -> NARRATION) and
// participantNaming.js (fuzzy character-name resolution) -- both need "how
// close is this hallucinated/garbled string to a known-good one", just
// against different alphabets.
export function editDistance(a, b) {
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
