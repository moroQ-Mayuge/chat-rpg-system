// { keywords: string[], match_mode: "any"|"all", target: "user_message"|"ai_response"|"any", case_sensitive?: bool }
export function evaluateKeyword(params, ctx) {
  const { keywords = [], match_mode = 'any', target = 'any', case_sensitive = false } = params;
  if (keywords.length === 0) return false;

  const texts = [];
  if (target === 'user_message' || target === 'any') texts.push(ctx.userMessage ?? '');
  if (target === 'ai_response' || target === 'any') texts.push(ctx.aiResponseText ?? '');
  const haystack = case_sensitive ? texts.join('\n') : texts.join('\n').toLowerCase();

  const needles = case_sensitive ? keywords : keywords.map((k) => k.toLowerCase());
  const hits = needles.map((k) => haystack.includes(k));

  return match_mode === 'all' ? hits.every(Boolean) : hits.some(Boolean);
}
