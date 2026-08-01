import { db } from '../../db/connection.js';
import { getPlaythrough } from '../../db/repositories/playthroughsRepo.js';
import { getWorld } from '../../db/repositories/worldsRepo.js';
import { getFlag } from '../../db/repositories/sessionFlagsRepo.js';
import { getCharacterFlag } from '../../db/repositories/characterFlagsRepo.js';
import { getValue as getRelationshipValue } from '../../db/repositories/relationshipStatesRepo.js';
import { getCurrentAddress } from '../../db/repositories/characterAddressStatesRepo.js';
import { withDisambiguatedNames } from '../participantNaming.js';
import { resolveMentionedList } from './mentionResolution.js';

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

// generateImage.js still keys its own participantsByName off the bare name
// (it substitutes outfit tags, not display text, and a mismatched outfit
// lookup fails closed rather than picking the wrong character) -- this stays
// for that one caller. resolvePlaceholderText below uses display names.
export function buildParticipantsByName(participants) {
  return new Map(participants.map((p) => [p.name, p]));
}

// Character field lookups a dot-suffix can resolve to, reusing each field's
// already-established name verbatim (DB column names, the exact flag_key an
// author would type into a 条件「フラグ状態」, the relationship axis name as
// configured in RelationshipAxesPage) rather than inventing a parallel
// vocabulary -- so ${target1.pregnancy_stage} means the same key a
// flag_state condition already reads, and ${target1.好感度} means the same
// axis a World author already named.
const CHARACTER_FIELD_COLUMNS = ['nickname', 'occupation', 'first_person', 'age_apparent'];

function resolveCharacterAttribute(participant, categoryKey, execCtx) {
  if (!categoryKey) return participant.display_name;

  if (categoryKey === 'current_address') {
    return getCurrentAddress(execCtx.playthroughId, participant.character_id, execCtx.session.id, participant.id) ?? '';
  }
  if (categoryKey.startsWith('flag:')) {
    const flagKey = categoryKey.slice('flag:'.length);
    const row = getCharacterFlag(participant.character_id, flagKey, 'playthrough', {
      playthroughId: execCtx.playthroughId,
      roomSessionId: execCtx.session.id,
    });
    return row?.flag_value ?? '';
  }
  if (CHARACTER_FIELD_COLUMNS.includes(categoryKey)) {
    const row = db.prepare(`SELECT ${categoryKey} FROM characters WHERE id = ?`).get(participant.character_id);
    return row?.[categoryKey] ?? '';
  }
  // Falls through to "is this a relationship axis name" -- axis names are
  // per-World free text (好感度/信頼度/...), so there's no fixed list to
  // check against ahead of time.
  const axis = db.prepare('SELECT id FROM relationship_axes WHERE name = ?').get(categoryKey);
  if (axis) {
    const value = getRelationshipValue(execCtx.playthroughId, participant.character_id, axis.id, execCtx.session.id, participant.id);
    return value != null ? String(value) : '';
  }
  return '';
}

// Non-participant tokens: ${player} plus a handful of global fixed keys.
// The five calendar/weather ones deliberately reuse the exact session_flags
// keys advanceTime() already writes (season/time_slot/weather/day_of_week/
// is_holiday, see playthroughsRepo.js) and read back the same already-
// resolved label string a flag_state condition would see -- not a second,
// differently-computed copy of "what season is it". ${flag:...} generalizes
// to any other route flag an author has set with アクション「フラグ操作」.
const GLOBAL_FLAG_TOKENS = new Set(['season', 'time_slot', 'weather', 'day_of_week', 'is_holiday']);

function resolveGlobalToken(base, execCtx) {
  if (base === 'player') {
    const playthrough = getPlaythrough(execCtx.playthroughId);
    return playthrough.protagonist_name?.trim() || 'あなた';
  }
  if (base === 'current_day') {
    return String(getPlaythrough(execCtx.playthroughId).current_day);
  }
  if (base === 'money') {
    return String(getPlaythrough(execCtx.playthroughId).money ?? 0);
  }
  if (base === 'currency_unit') {
    const playthrough = getPlaythrough(execCtx.playthroughId);
    return getWorld(playthrough.world_id).currency_unit ?? '';
  }
  if (GLOBAL_FLAG_TOKENS.has(base)) {
    return getFlag(execCtx.playthroughId, base)?.flag_value ?? '';
  }
  if (base.startsWith('flag:')) {
    return getFlag(execCtx.playthroughId, base.slice('flag:'.length))?.flag_value ?? '';
  }
  return null; // not a recognized global token -- caller falls back to participant lookup
}

// General-purpose ${...} resolver for free-authored text: insert_dialogue's
// fixed text AND generated-mode prompt_hint, set_scene_situation's text,
// add_character_memory/set_character_impression/set_address's content, and
// llm_judge's question. Distinct from generateImage.js's own resolution,
// which turns a token into outfit danbooru tags rather than display text.
//
// Candidate priority for target1/target2/...: @mention this turn, else (for
// a per_character_firing event) the one candidate this particular firing is
// about, else everyone currently present -- see eventEngine/index.js's
// matchedCharacterIds.
//
// Uses withDisambiguatedNames so ${target1} and ${さくら} agree with what
// the LLM itself sees and with how @mentions parse back (roomSessions.js) --
// two same-named or duplicated-mob participants no longer collide silently
// onto whichever one a plain name lookup happened to find first.
export function resolvePlaceholderText(text, execCtx) {
  if (!text) return text;
  const participants = withDisambiguatedNames(execCtx.session.participants);
  const participantsByName = new Map(participants.map((p) => [p.display_name, p]));
  const mentionedIds = resolveMentionedList(execCtx.mentionedCharacterIds, null);
  const candidateIds = mentionedIds.length > 0 ? mentionedIds : execCtx.matchedCharacterIds;
  const candidateParticipants = candidateIds
    ? candidateIds.map((id) => participants.find((p) => p.character_id === id)).filter(Boolean)
    : participants;

  return text.replace(/\$\{([^}]+)\}/g, (match, token) => {
    const dotIndex = token.indexOf('.');
    const base = dotIndex === -1 ? token : token.slice(0, dotIndex);
    const categoryKey = dotIndex === -1 ? null : token.slice(dotIndex + 1);

    const globalValue = resolveGlobalToken(base, execCtx);
    if (globalValue !== null) return globalValue;

    const positionalMatch = base.match(/^target(\d+)$/);
    const participant = positionalMatch ? candidateParticipants[Number(positionalMatch[1]) - 1] : participantsByName.get(base);
    if (!participant) return '';
    return resolveCharacterAttribute(participant, categoryKey, execCtx) ?? '';
  });
}
