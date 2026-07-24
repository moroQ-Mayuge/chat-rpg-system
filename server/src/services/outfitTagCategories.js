import { OUTFIT_TAG_FIELDS } from '../db/repositories/outfitsRepo.js';
import { listActiveStatuses } from '../db/repositories/characterStatusStatesRepo.js';

export const CATEGORY_KEYS = OUTFIT_TAG_FIELDS;

// Named shot-framing ranges, each usable bare (base clothing only), with an
// _outer suffix (上着・重ね着 layered on top, e.g. jackets), an _equipment
// suffix (追加装備 — armor, holsters, etc., genuinely non-everyday items), or
// a _full suffix (base + outer + equipment combined — NOT including
// underwear). belongings and underwear_upper/underwear_lower are
// deliberately never part of any range — belongings' position is too
// unpredictable (held, worn on the back, etc.) to attach to a specific
// framing, and underwear is only meant to surface when explicitly asked for
// (e.g. an undress-state event) — both are always individually referenced,
// e.g. ${target1.belongings} / ${target1.underwear_upper}.
const RANGE_BASE = {
  upperbody: ['main_features', 'hairstyle', 'clothing_main', 'clothing_face', 'clothing_upper'],
  cowboyshot: ['main_features', 'hairstyle', 'clothing_main', 'clothing_face', 'clothing_upper', 'clothing_lower', 'clothing_legs'],
  lowerbody: ['clothing_lower', 'clothing_legs', 'shoes'],
  fullbody: ['main_features', 'hairstyle', 'clothing_main', 'clothing_face', 'clothing_upper', 'clothing_lower', 'clothing_legs', 'shoes'],
};

const RANGE_OUTER = {
  upperbody: ['clothing_face_outer', 'clothing_upper_outer'],
  cowboyshot: ['clothing_face_outer', 'clothing_upper_outer', 'clothing_lower_outer', 'clothing_legs_outer'],
  lowerbody: ['clothing_lower_outer', 'clothing_legs_outer'],
  fullbody: ['clothing_face_outer', 'clothing_upper_outer', 'clothing_lower_outer', 'clothing_legs_outer'],
};

const RANGE_EQUIPMENT = {
  upperbody: ['clothing_face_equipment', 'clothing_upper_equipment'],
  cowboyshot: ['clothing_face_equipment', 'clothing_upper_equipment', 'clothing_lower_equipment', 'clothing_legs_equipment'],
  lowerbody: ['clothing_lower_equipment', 'clothing_legs_equipment'],
  fullbody: ['clothing_face_equipment', 'clothing_upper_equipment', 'clothing_lower_equipment', 'clothing_legs_equipment'],
};

const RANGE_NAMES = Object.keys(RANGE_BASE);

function joinFields(outfit, fields, suppressedFields, disturbedFieldStyles, exposureTagSettings) {
  return fields
    .filter((f) => !suppressedFields.has(f) && isUnderwearRevealed(outfit, f, suppressedFields, disturbedFieldStyles))
    .map((f) => {
      const value = outfit[f];
      const style = disturbedFieldStyles.get(f);
      const disturbanceTag = style ? exposureTagSettings?.[`${style}_tag`] : null;
      if (!value) return disturbanceTag || '';
      return disturbanceTag ? `${value}, ${disturbanceTag}` : value;
    })
    .filter(Boolean)
    .join(', ');
}

// Collects the currently-active undress-ladder modifiers for one character:
// suppressedFields (0035_status_suppresses_outfit_fields.sql -- a field is
// hidden entirely) and disturbedFieldStyles (0064 -- a field is still shown
// but has a disturbance-style tag appended, since a single character_statuses
// row IS one specific rung of the ladder -- see 0064's migration comment).
// Centralizes logic that used to live only in generateImage.js's local
// getSuppressedOutfitFields, so imagePromptBuilder.js can reuse the exact
// same rules for ambient scene generation.
export function getActiveOutfitStatusModifiers(characterId, statusCtx) {
  const active = listActiveStatuses(characterId, statusCtx);
  const suppressedFields = new Set();
  const disturbedFieldStyles = new Map();
  for (const status of active) {
    for (const field of (status.suppresses_outfit_fields || '').split(',').map((f) => f.trim()).filter(Boolean)) {
      suppressedFields.add(field);
    }
    if (status.disturbs_outfit_field && status.disturbance_style) {
      disturbedFieldStyles.set(status.disturbs_outfit_field, status.disturbance_style);
    }
  }
  return { suppressedFields, disturbedFieldStyles };
}

const UPPER_CLOTHING_LAYERS = ['clothing_upper_outer', 'clothing_upper'];
const LOWER_CLOTHING_LAYERS = ['clothing_lower_outer', 'clothing_lower'];
// Outer -> base -> underwear, the order breast_out's exposure walk checks.
const UPPER_FULL_LAYER_CHAIN = [...UPPER_CLOTHING_LAYERS, 'underwear_upper'];

function isFieldBare(outfit, field, suppressedFields) {
  return !outfit[field]?.trim() || suppressedFields.has(field);
}

function isFieldAtLeastDisturbed(outfit, field, suppressedFields, disturbedFieldStyles) {
  return isFieldBare(outfit, field, suppressedFields) || disturbedFieldStyles.has(field);
}

const UNDERWEAR_REVEAL_CHAINS = {
  underwear_upper: UPPER_CLOTHING_LAYERS,
  underwear_lower: LOWER_CLOTHING_LAYERS,
};

// A underwear field's own tag (and any disturbance tag on it) stays out of
// the output entirely until every layer above it is at least disturbed --
// image generation otherwise dutifully renders whatever tags are given, so
// leaving underwear_upper/lower unconditionally in the joined string would
// draw visible underwear under a fully-worn shirt. Non-underwear fields
// aren't gated at all (always revealed). A layer that doesn't exist on this
// outfit is treated as already cleared (isFieldAtLeastDisturbed's isFieldBare
// check), so an outfit with no outer garment doesn't block reveal on that
// account alone.
function isUnderwearRevealed(outfit, field, suppressedFields, disturbedFieldStyles) {
  const chain = UNDERWEAR_REVEAL_CHAINS[field];
  if (!chain) return true;
  return chain.every((f) => isFieldAtLeastDisturbed(outfit, f, suppressedFields, disturbedFieldStyles));
}

// Derives whole-character nudity tags (topless/bottomless/completely_nude/
// breast_out) from the current suppression/disturbance state -- these
// describe overall exposure, not one specific OUTFIT_TAG_FIELDS column, so
// callers only append this once per character (on the "all fields combined"
// path), never per-category placeholder lookups.
export function computeNudityTags(outfit, suppressedFields, disturbedFieldStyles, settings) {
  if (!outfit || !settings) return [];
  const tags = [];
  const upperBare = UPPER_CLOTHING_LAYERS.every((f) => isFieldBare(outfit, f, suppressedFields));
  const lowerBare = LOWER_CLOTHING_LAYERS.every((f) => isFieldBare(outfit, f, suppressedFields));
  if (upperBare && lowerBare) {
    if (settings.completely_nude_tag) tags.push(settings.completely_nude_tag);
  } else if (upperBare) {
    if (settings.topless_tag) tags.push(settings.topless_tag);
  } else if (lowerBare) {
    if (settings.bottomless_tag) tags.push(settings.bottomless_tag);
  }

  // breast_out: walk outer -> base -> underwear; a layer that doesn't exist
  // on this outfit is skipped, but a layer that DOES exist and is still at
  // its base "normal" stage stops the walk (it's covering) -- only reaching
  // the end of the chain (every existing layer at least disturbed/removed)
  // counts as exposed.
  let exposed = true;
  for (const field of UPPER_FULL_LAYER_CHAIN) {
    if (!outfit[field]?.trim()) continue;
    if (isFieldAtLeastDisturbed(outfit, field, suppressedFields, disturbedFieldStyles)) continue;
    exposed = false;
    break;
  }
  if (exposed && settings.breast_out_tag) tags.push(settings.breast_out_tag);

  return tags;
}

// Resolves a category key (used both for an Outfit's own full-tag composition
// and for ${target1.<key>} placeholders in event/scene prompt templates) into
// the actual joined danbooru tag string.
//   key == null        -> all categories combined (incl. belongings/underwear) —
//                          the direct successor to the old flat image_tags.
//   key is a category  -> that single column's value.
//   key is a range name (optionally _outer/_equipment/_full) -> the matching
//                          field set. _full = base + outer + equipment
//                          (underwear is never included — reference it
//                          individually via ${target1.underwear_upper} etc.)
//   anything else       -> null (unresolvable — caller decides the fallback).
//
// suppressedFields: optional iterable of OUTFIT_TAG_FIELDS column names to
// omit regardless of the outfit's own value — driven by the character's
// currently-active undress-state statuses' suppresses_outfit_fields (see
// characterStatusStatesRepo.js's listActiveStatuses), so a layer that's
// "not there" per the current stage doesn't leak into generated prompts.
// Omitted entirely by every existing call site that doesn't have status
// context (standing/expression image generation, settings-page preview).
//
// disturbedFieldStyles/exposureTagSettings (0064): a field that's shown (not
// suppressed) but named by an active undress-ladder status's
// disturbs_outfit_field gets exposureTagSettings's fixed tag for that style
// appended after its own tag value — see getActiveOutfitStatusModifiers.
export function resolveOutfitTags(outfit, key, suppressedFields = [], disturbedFieldStyles = new Map(), exposureTagSettings = null) {
  if (!outfit) return '';
  const suppressed = suppressedFields instanceof Set ? suppressedFields : new Set(suppressedFields);
  if (!key) return joinFields(outfit, CATEGORY_KEYS, suppressed, disturbedFieldStyles, exposureTagSettings);
  if (CATEGORY_KEYS.includes(key)) return joinFields(outfit, [key], suppressed, disturbedFieldStyles, exposureTagSettings);

  const rangeMatch = key.match(new RegExp(`^(${RANGE_NAMES.join('|')})(_outer|_equipment|_full)?$`));
  if (rangeMatch) {
    const [, range, suffix] = rangeMatch;
    if (!suffix) return joinFields(outfit, RANGE_BASE[range], suppressed, disturbedFieldStyles, exposureTagSettings);
    if (suffix === '_outer') return joinFields(outfit, RANGE_OUTER[range], suppressed, disturbedFieldStyles, exposureTagSettings);
    if (suffix === '_equipment') return joinFields(outfit, RANGE_EQUIPMENT[range], suppressed, disturbedFieldStyles, exposureTagSettings);
    return joinFields(
      outfit,
      [...RANGE_BASE[range], ...RANGE_OUTER[range], ...RANGE_EQUIPMENT[range]],
      suppressed,
      disturbedFieldStyles,
      exposureTagSettings,
    );
  }

  return null;
}
