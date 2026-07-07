// Renders a user-editable prompt template (fixed placeholder set, e.g.
// ${style_preset}, ${character_tags}) against a variables object. Missing/
// empty placeholders are dropped cleanly (rather than leaving stray commas)
// by substituting first, then re-joining non-empty comma-separated segments.
export function renderPromptTemplate(template, variables) {
  const substituted = (template || '').replace(/\$\{(\w+)\}/g, (match, key) => variables[key] ?? '');
  return substituted
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(', ');
}
