import { generateChatCompletion } from '../../koboldClient.js';
import { resolvePlaceholderText } from '../placeholderResolution.js';
import { withDisambiguatedNames } from '../../participantNaming.js';

// { question } — a yes/no question judged against the just-generated turn
// (user_message + ai_response), for event outcome checks that a
// deterministic condition type can't express (SPEC.md chat enhancement
// backlog item 5: combine with the existing deterministic condition types,
// not replace them). Fails closed (false) on any parse/request error, since
// an outcome check silently defaulting to "success" would be more
// surprising than defaulting to "failure".
//
// Prompt shape + temperature verified empirically against the actual
// running instance (Mistral-nemo-ja-rp Q3_K_M):
//  - A system-prompt-led instruction with labeled "ユーザー:"/"応答:" context
//    produced an EMPTY completion every time — this RP-tuned model's chat
//    template appears to treat that shape as a turn-taking cue and stops
//    immediately. A single plain user message with the conversation inlined
//    as prose reliably produces a one-word yes/no instead.
//  - temperature=0.5 flipped the answer for the exact same input in 2/5 runs
//    (a classification call should be deterministic, unlike creative
//    generation) — temperature=0.05 was stable across 5/5 runs each for
//    both a clearly-friendly and clearly-hostile test input.
export async function evaluateLlmJudge(params, ctx) {
  const { question } = params;
  if (!question) return false;

  // Same gap insert_dialogue's generated mode had: without a cast list the
  // model has no way to know who "${target1}" or a bare name in the
  // question even refers to, let alone who's present at all. Resolves
  // ${target1}/${player}/${target1.pregnancy_stage}/etc. in the question
  // itself (same as narration text) and separately grounds the judge with
  // who's actually in the room, since a question can reference someone by
  // name without going through a placeholder at all.
  const names = withDisambiguatedNames(ctx.participants ?? []).map((p) => p.display_name);
  const presentLine = names.length > 0 ? `この場にいる人物：${names.join('、')}` : '';
  const resolvedQuestion = resolvePlaceholderText(question, ctx) ?? question;

  const prompt = [
    '次の会話を読んで、質問にyesかnoの一言だけで答えてください。',
    presentLine,
    '',
    `ユーザーの発言：「${ctx.userMessage ?? ''}」`,
    `キャラクターの応答：「${ctx.aiResponseText ?? ''}」`,
    '',
    `質問：${resolvedQuestion}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const raw = await generateChatCompletion({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 10,
      temperature: 0.05,
    });
    const normalized = raw.trim().toLowerCase();
    return normalized.includes('yes') || normalized.includes('はい');
  } catch (err) {
    console.error('llm_judge condition failed:', err);
    return false;
  }
}
