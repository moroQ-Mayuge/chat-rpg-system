import { editDistance } from './textDistance.js';

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

// モブにランダム付与されたペルソナ(mob_flavor_presets、部屋登場時に抽選/LLM生成)
// があれば、以降のA/B連番・同名(2)ロジックはこの名前を基準に行う——ベースの
// characters.nameは共有マスタなので、ペルソナが無い間はそのまま使う。
// roomSessionsRepo.jsのattachParticipantsも(退室済み参加者のdisplay_name計算に)
// これをそのまま使うため公開している——UI側の@メンション等がこの名前とずれる
// と、resolveMentions()側の照合(`@${display_name}`)が一致しなくなる。
export function participantBaseName(p) {
  return p.mob_flavor_name ? `${p.mob_flavor_name}（モブ）` : p.name;
}

export function withDisambiguatedNames(participants) {
  const nameSeen = new Map();
  const characterIdSeen = new Map();
  return participants.map((p) => {
    const baseName = participantBaseName(p);
    const characterOccurrence = (characterIdSeen.get(p.character_id) ?? 0) + 1;
    characterIdSeen.set(p.character_id, characterOccurrence);
    if (characterOccurrence > 1) {
      return { ...p, display_name: `${baseName}${letterSuffix(characterOccurrence - 1)}` };
    }
    const nameCount = (nameSeen.get(baseName) ?? 0) + 1;
    nameSeen.set(baseName, nameCount);
    return { ...p, display_name: nameCount === 1 ? baseName : `${baseName}(${nameCount})` };
  });
}

// 部分一致(includes)でも解決できない崩れ方——名前の途中に無関係な文字列が
// 挿入されるケース(実プレイで観測: 「早苗ことり」→「早 niñoことり」)は末尾切れ・
// 重複と違って両方向のincludesが成立しないため、部分一致では原理的に拾えない。
// 日本語の名前にラテン文字・数字・空白が紛れ込むのは常に崩れであってキャラ名の
// 一部ではあり得ないので、それらを削ぎ落としてから比較すれば「早 niñoことり」も
// 「早ことり」まで戻せる——実名「早苗ことり」との編集距離1で一意に解決できる。
// (responseParser.jsのnormalizeTagWordが記号・日本語を削ぎ落として比較するのと
// 対になる発想: 削ぎ落とす対象がASCII/日本語で逆なだけ。)
function keepJapaneseOnly(value) {
  return (value.match(/[ぁ-んァ-ヶ一-龠々〆ヵヶ]/g) || []).join('');
}

// 名前の長さに対して緩すぎる編集距離を許すと別人と誤解決するので、短い名前ほど
// 厳しく絞る(2文字の名前で距離2まで許すと、ほぼ何にでも一致してしまう)。
const NAME_FUZZ_MAX_RATIO = 0.34;

// 「モデルが書いた[名前]:を実際の参加者へ解決する」規則。完全一致→部分一致→
// (それでも外れた場合のみ)日本語以外を除去した上での編集距離、の3段構え。
// どの段でも候補が2人以上なら解決しない(取り違えるより未解決として扱う方が安全)。
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
    if (candidates.length === 1) return candidates[0][1];
    if (candidates.length > 1) return null;

    const cleaned = keepJapaneseOnly(name);
    if (!cleaned) return null;
    const distances = [...byName.entries()].map(([displayName, p]) => ({
      p,
      d: editDistance(cleaned, keepJapaneseOnly(displayName)),
    }));
    const minDistance = Math.min(...distances.map((entry) => entry.d));
    if (minDistance > Math.max(1, Math.floor(cleaned.length * NAME_FUZZ_MAX_RATIO))) return null;
    const closest = distances.filter((entry) => entry.d === minDistance);
    return closest.length === 1 ? closest[0].p : null;
  }
  return { byName, resolve };
}
