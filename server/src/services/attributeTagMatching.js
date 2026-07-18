// Character attribute-key auto-matching (chat enhancement backlog item 23):
// shared parsing/overlap helpers for the comma-separated attribute_tags
// columns on characters, worlds, and room_templates.
export function parseAttributeTags(text) {
  return (text || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function tagsOverlap(tagsA, tagsB) {
  const setB = new Set(tagsB);
  return tagsA.some((t) => setB.has(t));
}

// "すべて" is a sentinel token: when present in the CONTEXT tags (room/World/
// slot), it unconditionally matches every candidate, including candidates
// with zero attribute_tags of their own (who could never match under plain
// tagsOverlap). Recorded feature request, see room_slot_time_and_tag_presence
// memory -- lets untagged/未所属 characters still auto-populate a room whose
// author wants "anyone can be here".
const WILDCARD_TAG = 'すべて';

export function tagsOverlapOrWildcard(candidateTags, contextTags) {
  if (contextTags.includes(WILDCARD_TAG)) return true;
  return tagsOverlap(candidateTags, contextTags);
}
