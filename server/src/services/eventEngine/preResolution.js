import { getRoomSession } from '../../db/repositories/roomSessionsRepo.js';
import { listActiveEventDefinitionsForRoomTemplate } from '../../db/repositories/eventDefinitionsRepo.js';
import { countUserTurnsForPlaythrough } from '../../db/repositories/messagesRepo.js';
import { getAllFlags, getFlag } from '../../db/repositories/sessionFlagsRepo.js';
import { getMatchingCharacters } from './conditions/registry.js';
import { computeEligibleEntries, resolveExclusiveGroups, dryRunOutcome } from './index.js';
import { isPreResolvable } from './preResolutionEligibility.js';

// キャラを名指ししないper_character_firing以外の発火(characterId===null)で、
// かつoutcome分岐がある場合、ヒントを誰のキャラカードに載せるかを決める。
// outcome側のルート条件(成否そのものを決めている条件、例: relationship_probability)
// を最優先し、無ければトリガー側条件、それでも決まらなければ@メンションが
// 1人だけの場合に限りその相手にフォールバックする。1人にも絞れなければ
// ヒントは出さない(誤った相手に「同意した」と思わせるくらいなら出さない方が安全)。
function resolveHintTarget(def, baseCtx) {
  const outcomeRootConditions = def.conditions.filter((c) => c.phase === 'outcome' && (c.outcome_node_id ?? null) === null);
  const triggerConditions = def.conditions.filter((c) => c.phase !== 'outcome');
  for (const condition of [...outcomeRootConditions, ...triggerConditions]) {
    const matched = getMatchingCharacters(condition, { ...baseCtx, eventDefinitionId: def.id });
    if (matched && matched.length > 0) return matched[0];
  }
  if (baseCtx.mentionedCharacterIds?.length === 1) return baseCtx.mentionedCharacterIds[0];
  return null;
}

// LLM生成前に呼ぶ、読み取り専用の事前解決パス(2026-09-11)。「同行して」の
// ようなkeyword(user_message)トリガー＋relationship_probability等のoutcome
// 判定だけで完結するイベントは、生成テキストに一切依存せず今この時点で
// 確定できる——それを実際に確定させ(index.jsのcomputeEligibleEntries/
// dryRunOutcomeを流用、アクションは実行しない)、結果を対象キャラの
// プロンプトへのヒント文言として集約して返す。
//
// アクションを一切実行しないため、同じイベントが後段のrunEventEngineで
// 二重に発火することはない——conditionCacheをrunEventEngineへそのまま渡せば、
// 既に確定した条件結果(確率ロール含む)がそのまま再利用され、発火自体は
// 後段で一度だけ行われる(実際のアクション実行・cooldown/max_fires記録・
// broadcastは全てそちら側の既存経路のまま)。
//
// 失敗しても(DBエラー等)呼び出し元がtry/catchでヒント無しにフォールバック
// できるよう、ここでは例外を握りつぶさない。
export async function resolvePregenerationEventOutcomes({ sessionId, playthroughId, roomTemplateId, userMessage, mentionedCharacterIds }) {
  const session = getRoomSession(sessionId);
  const turnNumber = countUserTurnsForPlaythrough(playthroughId);
  const flags = getAllFlags(playthroughId);
  const defs = listActiveEventDefinitionsForRoomTemplate(roomTemplateId).filter(isPreResolvable);

  // aiResponseTextはnull固定——isPreResolvableで弾いた条件種別は生成テキストを
  // 一切読まないため、これで正しい(読まれること自体が無い)。
  const baseCtx = {
    session,
    playthroughId,
    roomTemplateId,
    turnNumber,
    flags,
    userMessage,
    aiResponseText: null,
    participants: session.participants,
    mentionedCharacterIds,
    flagSetAtTurn: (flagKey) => getFlag(playthroughId, flagKey)?.set_at_turn ?? null,
  };

  const conditionCache = new Map();
  const eligible = await computeEligibleEntries(
    defs,
    baseCtx,
    { playthroughId, roomSessionId: sessionId, turnNumber, roomTemplateId },
    conditionCache,
  );
  const firing = resolveExclusiveGroups(eligible);

  const hintsByCharacterId = new Map();
  for (const { def, characterId } of firing) {
    if (!def.has_outcome_branch) continue;
    const outcome = await dryRunOutcome(def, baseCtx, conditionCache);
    const hintText = outcome === 'success' ? def.outcome_success_hint_text : def.outcome_failure_hint_text;
    if (!hintText?.trim()) continue;
    const targetId = characterId ?? resolveHintTarget(def, baseCtx);
    if (targetId == null) continue;
    if (!hintsByCharacterId.has(targetId)) hintsByCharacterId.set(targetId, []);
    hintsByCharacterId.get(targetId).push(hintText.trim());
  }

  return { conditionCache, hintsByCharacterId };
}
