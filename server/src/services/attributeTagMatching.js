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
