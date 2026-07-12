import { OUTFIT_TAG_FIELDS } from '../db/repositories/outfitsRepo.js';

export const CATEGORY_KEYS = OUTFIT_TAG_FIELDS;

// Named shot-framing ranges, each usable bare (base clothing only), with an
// _extra suffix (only the layered-on-top equipment for that range), or a
// _full suffix (base + extra combined). belongings is deliberately never
// part of any range — its position is too unpredictable (held, worn on the
// back, etc.) to attach to a specific framing, so it's always individually
// referenced via ${target1.belongings}.
const RANGE_BASE = {
  upperbody: ['main_features', 'hairstyle', 'clothing_main', 'clothing_face', 'clothing_upper'],
  cowboyshot: ['main_features', 'hairstyle', 'clothing_main', 'clothing_face', 'clothing_upper', 'clothing_lower', 'clothing_legs'],
  lowerbody: ['clothing_lower', 'clothing_legs', 'shoes'],
  fullbody: ['main_features', 'hairstyle', 'clothing_main', 'clothing_face', 'clothing_upper', 'clothing_lower', 'clothing_legs', 'shoes'],
};

const RANGE_EXTRA = {
  upperbody: ['clothing_face_extra', 'clothing_upper_extra'],
  cowboyshot: ['clothing_face_extra', 'clothing_upper_extra', 'clothing_lower_extra', 'clothing_legs_extra'],
  lowerbody: ['clothing_lower_extra', 'clothing_legs_extra'],
  fullbody: ['clothing_face_extra', 'clothing_upper_extra', 'clothing_lower_extra', 'clothing_legs_extra'],
};

const RANGE_NAMES = Object.keys(RANGE_BASE);

function joinFields(outfit, fields) {
  return fields
    .map((f) => outfit[f])
    .filter(Boolean)
    .join(', ');
}

// Resolves a category key (used both for an Outfit's own full-tag composition
// and for ${target1.<key>} placeholders in event/scene prompt templates) into
// the actual joined danbooru tag string.
//   key == null        -> all 13 categories combined (incl. belongings) —
//                          the direct successor to the old flat image_tags.
//   key is a category  -> that single column's value.
//   key is a range name (optionally _extra/_full) -> the matching field set.
//   anything else       -> null (unresolvable — caller decides the fallback).
export function resolveOutfitTags(outfit, key) {
  if (!outfit) return '';
  if (!key) return joinFields(outfit, CATEGORY_KEYS);
  if (CATEGORY_KEYS.includes(key)) return outfit[key] ?? '';

  const rangeMatch = key.match(new RegExp(`^(${RANGE_NAMES.join('|')})(_extra|_full)?$`));
  if (rangeMatch) {
    const [, range, suffix] = rangeMatch;
    if (!suffix) return joinFields(outfit, RANGE_BASE[range]);
    if (suffix === '_extra') return joinFields(outfit, RANGE_EXTRA[range]);
    return joinFields(outfit, [...RANGE_BASE[range], ...RANGE_EXTRA[range]]);
  }

  return null;
}
