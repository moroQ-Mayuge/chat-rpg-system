// Hardcoded phrase list for detecting a local LLM's refusal/censorship
// response (0067) -- a pragmatic keyword match rather than a second LLM
// call, consistent with this app's other lightweight text-based
// classification (e.g. eventEngine's keyword conditions). Mirrors the kinds
// of refusals mature_content_mode's system-prompt block (promptBuilder.js)
// is meant to prevent in the first place: apology-prefixed declines,
// moralizing/content-policy language, and "as an AI" framing.
const REFUSAL_PHRASES = [
  '申し訳ございません',
  '申し訳ありません',
  '申し訳ないですが',
  'お答えできません',
  'お応えできません',
  '対応できません',
  '対応いたしかねます',
  'できかねます',
  'ご期待に沿えません',
  '不適切な内容',
  '倫理的に',
  'コンテンツポリシー',
  'content policy',
  "i'm sorry, but",
  'i cannot ',
  "i can't ",
  'as an ai',
  'i am an ai',
  "i'm an ai",
  'unable to comply',
  'against my guidelines',
];

export function isRefusalText(text) {
  const normalized = (text || '').trim().toLowerCase();
  if (!normalized) return false;
  return REFUSAL_PHRASES.some((phrase) => normalized.includes(phrase.toLowerCase()));
}
