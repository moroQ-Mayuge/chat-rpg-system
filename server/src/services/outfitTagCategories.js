import { OUTFIT_TAG_FIELDS } from '../db/repositories/outfitsRepo.js';

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

function joinFields(outfit, fields, suppressedFields) {
  return fields
    .filter((f) => !suppressedFields.has(f))
    .map((f) => outfit[f])
    .filter(Boolean)
    .join(', ');
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
export function resolveOutfitTags(outfit, key, suppressedFields = []) {
  if (!outfit) return '';
  const suppressed = suppressedFields instanceof Set ? suppressedFields : new Set(suppressedFields);
  if (!key) return joinFields(outfit, CATEGORY_KEYS, suppressed);
  if (CATEGORY_KEYS.includes(key)) return suppressed.has(key) ? '' : outfit[key] ?? '';

  const rangeMatch = key.match(new RegExp(`^(${RANGE_NAMES.join('|')})(_outer|_equipment|_full)?$`));
  if (rangeMatch) {
    const [, range, suffix] = rangeMatch;
    if (!suffix) return joinFields(outfit, RANGE_BASE[range], suppressed);
    if (suffix === '_outer') return joinFields(outfit, RANGE_OUTER[range], suppressed);
    if (suffix === '_equipment') return joinFields(outfit, RANGE_EQUIPMENT[range], suppressed);
    return joinFields(outfit, [...RANGE_BASE[range], ...RANGE_OUTER[range], ...RANGE_EQUIPMENT[range]], suppressed);
  }

  return null;
}
