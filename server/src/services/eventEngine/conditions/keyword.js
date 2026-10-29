// { keywords: string[], match_mode: "any"|"all", target: "user_message"|"ai_response"|"any", case_sensitive?: bool, negate?: bool }
// negate: 「含まない時に成立」。match_mode が any なら「どの語も含まない」、all なら「全部は含まない」。
// キーワードが空の時は、negate に関わらず不成立(設定漏れで常に成立してしまうのを防ぐ)。
export function evaluateKeyword(params, ctx) {
  const { keywords = [], match_mode = 'any', target = 'any', case_sensitive = false } = params;
  if (keywords.length === 0) return false;

  const texts = [];
  if (target === 'user_message' || target === 'any') texts.push(ctx.userMessage ?? '');
  if (target === 'ai_response' || target === 'any') texts.push(ctx.aiResponseText ?? '');
  const haystack = case_sensitive ? texts.join('\n') : texts.join('\n').toLowerCase();

  const needles = case_sensitive ? keywords : keywords.map((k) => k.toLowerCase());
  const hits = needles.map((k) => haystack.includes(k));

  const matched = match_mode === 'all' ? hits.every(Boolean) : hits.some(Boolean);
  return params.negate ? !matched : matched;
}
