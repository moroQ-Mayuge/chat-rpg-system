import { Router } from 'express';
import { db } from '../db/connection.js';
import {
  getRoomSession,
  exitRoomSession,
  updateSessionScene,
  setCurrentSceneImage,
  endSessionForMove,
  createRoomSession,
  setAccompanying,
  updateParticipantOutfit,
  updateParticipantTransformation,
  updateParticipantPose,
} from '../db/repositories/roomSessionsRepo.js';
import { wearMasterAsCharacter, getMasterByName } from '../db/repositories/outfitMastersRepo.js';
import { getTransformation } from '../db/repositories/characterTransformationsRepo.js';
import { resolveProtagonist, applyMovementCost, getPlaythrough, adjustMoney } from '../db/repositories/playthroughsRepo.js';
import { getWorld } from '../db/repositories/worldsRepo.js';
import { findOrCreateWorldItem, getItem, listPickupItemsForSession, markItemPickedUp } from '../db/repositories/itemsRepo.js';
import { resolveCategoryOrFallback } from '../db/repositories/itemCategoriesRepo.js';
import { addItemToInventory, removeItemFromInventory } from '../db/repositories/inventoryRepo.js';
import { addOutfitToInventory, hasOutfit } from '../db/repositories/playthroughOutfitInventoryRepo.js';
import { getConnection } from '../db/repositories/roomConnectionsRepo.js';
import { listMessagesForSession, createMessage } from '../db/repositories/messagesRepo.js';
import { createGeneratedImage } from '../db/repositories/generatedImagesRepo.js';
import { buildMultiCharacterMessages } from '../services/promptBuilder.js';
import { parseScriptLine } from '../services/responseParser.js';
import { isRefusalText } from '../services/refusalDetection.js';
import { exploreRoom, makeItemAvailable } from '../services/itemDiscovery.js';
import { listActionCommandsForWorld } from '../db/repositories/actionCommandsRepo.js';
import { generateChatCompletion, generateImage, generateTxt2Image } from '../services/koboldClient.js';
import { buildSceneTagParts, buildReferenceAnchorCanvas, cropMainRegion, suggestSceneTags } from '../services/imagePromptBuilder.js';
import { renderPromptTemplate } from '../services/promptTemplate.js';
import { enqueueImageJob } from '../services/imageQueue.js';
import { saveGeneratedImage } from '../storage/imageStorage.js';
import { runEventEngine } from '../services/eventEngine/index.js';
import { resolveStylePromptForWorld } from '../db/repositories/imageStylePresetsRepo.js';
import { getImageGenerationSettings } from '../db/repositories/imageGenerationSettingsRepo.js';
import { getImageFormat } from '../db/repositories/imageFormatSettingsRepo.js';
import { withDisambiguatedNames } from '../services/participantNaming.js';
import { broadcast } from '../ws/rooms.js';
import { listLlmAutoUpdateEnabledAxes } from '../db/repositories/relationshipAxesRepo.js';
import { adjustValue, getValue } from '../db/repositories/relationshipStatesRepo.js';
import { maybeRunRelationshipAutoUpdate } from '../services/relationshipAutoUpdate.js';
import { clampLlmDelta } from '../services/llmValueDelta.js';
import { maybeRunImpressionAutoUpdate } from '../services/impressionAutoUpdate.js';
import { maybeRunMemoryAutoExtract } from '../services/memoryAutoExtract.js';

export const roomSessionsRouter = Router();

// Ephemeral user turns for "continue from here" submissions (empty input, or
// input that's nothing but @mentions -- see isContentOnlyMentions). Never
// persisted to the messages table and never shown in the chat UI; they exist
// only so the completion call doesn't end on an assistant message. Written as
// parenthesised stage directions so the model doesn't mistake them for the
// player's own speech or action. See generateReply for why a blank turn
// doesn't work.
const CONTINUATION_TURN =
  '（プレイヤーは特に発言も行動もしない。この場面の続きを、上記のキャラクターたちの言動と情景として描写してください。）';
const SURROUNDINGS_TURN = '（プレイヤーは周囲を見回している。この場所の様子や、目に入るもの・人を描写してください。）';

roomSessionsRouter.get('/:id', (req, res) => {
  const session = getRoomSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'not_found' });
  res.json({ ...session, messages: listMessagesForSession(req.params.id) });
});

roomSessionsRouter.get('/:id/messages', (req, res) => {
  res.json(listMessagesForSession(req.params.id));
});

// Resolves "@name" tokens against the session's current participants
// (Teams/Slack-style mention, chat enhancement backlog item 3c) — lets the
// player explicitly select an action/utterance's target rather than the
// event engine having to infer it from context. Order matters here: this
// drives ${target1}/${target2}/... resolution (mentionResolution.js), so the
// result must reflect the left-to-right order @names actually appear in the
// message, not participants' fixed list order.
//
// Matches against display_name (withDisambiguatedNames), not the bare
// character name, so duplicate mob instances in the same session (e.g.
// "モブ・中学生" / "モブ・中学生A") resolve to distinct room_session_characters
// rows instead of both collapsing onto the same character_id (bugreports
// 2026-07-19 follow-up). Sorting by idx then len-desc means a longer,
// more-specific match ("モブ・中学生A") wins over a shorter one that happens
// to be its prefix ("モブ・中学生") when both start at the same position.
//
// Returns { ids, instanceByCharacterId }: `ids` is the existing flat
// character_id array every other consumer (DB storage, ${target1}
// resolution, non-mob event targeting) already expects unchanged; instances
// mentioned by their disambiguated name land in `instanceByCharacterId`
// (Map<character_id, room_session_character_id>) for mob-instance-aware
// actions to consult when a mention specifically named one instance.
function resolveMentions(content, participants) {
  const disambiguated = withDisambiguatedNames(participants);
  const matches = [];
  for (const p of disambiguated) {
    const idx = content.indexOf(`@${p.display_name}`);
    if (idx !== -1) matches.push({ idx, len: p.display_name.length, character_id: p.character_id, instance_id: p.id });
  }
  matches.sort((a, b) => a.idx - b.idx || b.len - a.len);
  const ids = [];
  const instanceByCharacterId = new Map();
  const seen = new Set();
  for (const m of matches) {
    if (!seen.has(m.character_id)) {
      seen.add(m.character_id);
      ids.push(m.character_id);
      instanceByCharacterId.set(m.character_id, m.instance_id);
    }
  }
  return { ids: ids.length > 0 ? ids : null, instanceByCharacterId };
}

// Content that's empty, OR contains nothing but @mention tokens (e.g. just
// "@みお" with no actual instruction), is treated as "continue from here" --
// the mention(s) are discarded entirely rather than biasing the
// continuation toward that character (kept simple per design decision).
function isContentOnlyMentions(content, participants) {
  let stripped = content;
  for (const p of withDisambiguatedNames(participants)) {
    stripped = stripped.split(`@${p.display_name}`).join('');
  }
  stripped = stripped.split('@周辺').join('');
  return stripped.trim().length === 0;
}

// 「待つ」 sits in the しらべる category but is the opposite of looking around,
// so it must not stock the room. Matched on the command's own keyword_text
// rather than its label, since that's what actually gets sent as chat text.
const NON_EXPLORING_KEYWORD = '（そのまま何も言わず、今の状況が続くのを見守る）';

// Does this player input count as looking around the room? @周辺 (the existing
// surroundings-check mode) plus any しらべる-category command — those are the
// two ways the UI offers to examine a place.
function isExplorationInput(content, session) {
  if (!content) return false;
  if (content.includes('@周辺')) return true;
  const worldId = db.prepare('SELECT world_id FROM playthroughs WHERE id = ?').get(session.playthrough_id)?.world_id;
  return listActionCommandsForWorld(worldId).some(
    (cmd) =>
      cmd.category === 'しらべる' &&
      cmd.keyword_text &&
      cmd.keyword_text !== NON_EXPLORING_KEYWORD &&
      content.includes(cmd.keyword_text),
  );
}

// Empty content is not rejected — it's an explicit "continue from here"
// request (no user action/speech). No user message row is created for it,
// so nothing shows up as a player turn; generateReply() below feeds the LLM
// call a minimal ephemeral turn instead (never persisted, never displayed).
roomSessionsRouter.post('/:id/messages', (req, res) => {
  const content = (req.body.content ?? '').trim();
  const session = getRoomSession(req.params.id);
  const isContinuation = content.length === 0 || isContentOnlyMentions(content, session.participants);

  let message = null;
  let mentionedCharacterIds = null;
  let mentionedInstanceByCharacterId = new Map();
  if (!isContinuation) {
    const resolved = resolveMentions(content, session.participants);
    mentionedCharacterIds = resolved.ids;
    mentionedInstanceByCharacterId = resolved.instanceByCharacterId;
    message = createMessage(req.params.id, {
      sender_type: 'user',
      content,
      mentioned_character_ids: mentionedCharacterIds,
    });
  }
  res.status(201).json(message ?? { continuation: true });

  // Looking around is what stocks the 拾う list — a room nobody has explored
  // yet offers nothing (0072), and each look turns up one thing at a time
  // (0073). Runs before the reply so the "見つけた" line lands ahead of the
  // model's narration.
  if (isExplorationInput(content, session)) {
    for (const item of exploreRoom(session.playthrough_id, session.room_template_id)) {
      const found = createMessage(req.params.id, { sender_type: 'narration', content: `『${item.name}』を見つけた。` });
      broadcast(req.params.id, { type: 'message_complete', message: found });
    }
  }

  generateReply(req.params.id, content, mentionedCharacterIds, isContinuation, mentionedInstanceByCharacterId).catch((err) => {
    console.error('generateReply failed:', err);
    broadcast(req.params.id, { type: 'error', message: err.message });
  });
});

// What's pickable in this room right now (0071). Scoped to the session rather
// than the World's item master so the list doesn't accumulate — see
// listPickupItemsForSession.
roomSessionsRouter.get('/:id/pickup-items', (req, res) => {
  if (!getRoomSession(req.params.id)) return res.status(404).json({ error: 'not_found' });
  res.json(listPickupItemsForSession(req.params.id));
});

// Adds a pickable item to the inventory and records it as taken for this
// session. Done server-side in one place so the inventory row and the
// "already picked" record can't drift apart.
roomSessionsRouter.post('/:id/pickup', (req, res) => {
  const itemId = req.body.item_id;
  if (!itemId) return res.status(400).json({ error: 'item_id_required' });

  const session = getRoomSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'not_found' });

  // Must still be on offer here — guards against a stale panel picking
  // something already taken, or an item that doesn't belong to this room.
  const available = listPickupItemsForSession(req.params.id).some((i) => i.id === Number(itemId));
  if (!available) return res.status(400).json({ error: 'not_available_here' });

  addItemToInventory(session.playthrough_id, itemId, 1);
  markItemPickedUp(req.params.id, itemId);
  res.status(201).json({ item: getItem(itemId), remaining: listPickupItemsForSession(req.params.id) });
});

// Sells one of the player's held items for money, only inside an is_shop
// room of a currency-enabled World, and only for items an admin has
// explicitly priced (sell_price non-null) -- mirrors the purchase flow's
// gating in generateReply's ITEM_GRANT handling above.
roomSessionsRouter.post('/:id/sell-item', (req, res) => {
  const itemId = req.body.item_id;
  if (!itemId) return res.status(400).json({ error: 'item_id_required' });

  const session = getRoomSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'not_found' });

  const worldId = db.prepare('SELECT world_id FROM playthroughs WHERE id = ?').get(session.playthrough_id).world_id;
  const world = getWorld(worldId);
  if (!session.room_is_shop || !world.currency_enabled) {
    return res.status(400).json({ error: 'not_a_shop' });
  }

  const item = getItem(itemId);
  if (!item || item.sell_price == null) {
    return res.status(400).json({ error: 'not_sellable' });
  }

  const removal = removeItemFromInventory(session.playthrough_id, itemId, 1);
  if (!removal.removed) {
    return res.status(400).json({ error: 'not_held' });
  }

  const money = adjustMoney(session.playthrough_id, item.sell_price);
  const message = createMessage(req.params.id, {
    sender_type: 'narration',
    content: `『${item.name}』を${item.sell_price}${world.currency_unit}で売却した。（所持金 ${money}${world.currency_unit}）`,
  });
  broadcast(req.params.id, { type: 'message_complete', message });
  broadcast(req.params.id, { type: 'money_changed', money });
  res.json({ money, message });
});

// 衣装アイテム(items.outfit_master_id が設定されたもの)を、対象キャラの現在の
// 着用衣装にする(実装順6)。プレイヤーはcharacters行を持たずoutfitsの対象に
// なれないため、character_id は常にNPC。既に同じマスタから取り込み済みの
// 衣装インスタンスがあれば使い回す(wearMasterAsCharacter側の挙動)。
roomSessionsRouter.post('/:id/wear-item', (req, res) => {
  const { character_id, item_id } = req.body;
  if (!character_id || !item_id) return res.status(400).json({ error: 'character_id_and_item_id_required' });

  const item = getItem(item_id);
  if (!item?.outfit_master_id) return res.status(400).json({ error: 'not_an_outfit_item' });

  const outfit = wearMasterAsCharacter(character_id, item.outfit_master_id);
  updateParticipantOutfit(req.params.id, character_id, outfit.id);
  broadcast(req.params.id, { type: 'participants_changed' });
  res.json({ outfit });
});

// 衣装マスタ専用の所持経済版(0096)。itemsを介さずplaythrough_outfit_inventoryを
// 直接見る——対象NPCがそのマスタを保有していなければ拒否する。
roomSessionsRouter.post('/:id/wear-outfit', (req, res) => {
  const { character_id, outfit_master_id } = req.body;
  if (!character_id || !outfit_master_id) return res.status(400).json({ error: 'character_id_and_outfit_master_id_required' });

  const session = getRoomSession(req.params.id);
  if (!hasOutfit(session.playthrough_id, outfit_master_id, character_id)) {
    return res.status(400).json({ error: 'not_held_by_target' });
  }

  const outfit = wearMasterAsCharacter(character_id, outfit_master_id);
  updateParticipantOutfit(req.params.id, character_id, outfit.id);
  broadcast(req.params.id, { type: 'participants_changed' });
  res.json({ outfit });
});

// 「変身のお願い」(実装順3)。character_transformations は character_id 必須の
// 1キャラ専用なので、対象キャラのものでない変身定義は実装順2のイベント
// アクションと同じ規約で拒否する。transformation_id 省略/nullで変身解除。
roomSessionsRouter.post('/:id/transform-request', (req, res) => {
  const { character_id, transformation_id } = req.body;
  if (!character_id) return res.status(400).json({ error: 'character_id_required' });
  if (transformation_id != null) {
    const transformation = getTransformation(transformation_id);
    if (!transformation || transformation.character_id !== Number(character_id)) {
      return res.status(400).json({ error: 'transformation_not_owned' });
    }
  }
  updateParticipantTransformation(req.params.id, character_id, transformation_id ?? null);
  broadcast(req.params.id, { type: 'participants_changed' });
  res.json({ transformation_id: transformation_id ?? null });
});

roomSessionsRouter.post('/:id/exit', async (req, res) => {
  // Catch-up relationship auto-update (SPEC.md): force-run while the
  // session is still active (participants still resolvable) so any turns
  // since the last periodic check aren't lost when the session ends.
  const session = getRoomSession(req.params.id);
  if (session) {
    const world = getWorld(getPlaythrough(session.playthrough_id).world_id);
    await maybeRunRelationshipAutoUpdate(session, world, { force: true });
    await maybeRunImpressionAutoUpdate(session, world);
    await maybeRunMemoryAutoExtract(session, world);
  }
  res.json(exitRoomSession(req.params.id));
});

// Moves the player from a "場所" (is_place room_template) to one of its
// outgoing connections. Unlike /exit, this does NOT unconditionally advance
// time — the connection's movement_cost is instead applied to the
// playthrough's sub-count budget (World.movement_points_per_time_slot),
// which only advances the time slot once exhausted. Participants flagged
// is_accompanying follow into the new session.
roomSessionsRouter.post('/:id/move', async (req, res) => {
  const session = getRoomSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'not_found' });

  const connection = getConnection(req.body.connection_id);
  if (!connection || connection.from_room_template_id !== session.room_template_id) {
    return res.status(400).json({ error: 'invalid_connection' });
  }
  // Connections are World-scoped now (0030_room_world_decoupling.sql) — a
  // stray connection from another World should never be reachable via the
  // normal UI, but this closes the gap for direct API calls.
  const playthroughWorldId = getPlaythrough(session.playthrough_id).world_id;
  if (connection.world_id !== playthroughWorldId) {
    return res.status(400).json({ error: 'invalid_connection' });
  }

  const carryOverParticipants = session.participants
    .filter((p) => p.is_accompanying)
    .map((p) => ({ character_id: p.character_id, current_outfit_id: p.current_outfit_id }));

  // Catch-up relationship auto-update (SPEC.md): same rationale as /exit —
  // room移動 also ends this room_session's message stream, so any turns
  // since the last periodic check should be captured before it does.
  const moveWorld = getWorld(playthroughWorldId);
  await maybeRunRelationshipAutoUpdate(session, moveWorld, { force: true });
  await maybeRunImpressionAutoUpdate(session, moveWorld);
  await maybeRunMemoryAutoExtract(session, moveWorld);

  endSessionForMove(session.id);
  const playthrough = applyMovementCost(session.playthrough_id, connection.movement_cost);
  const newSession = createRoomSession(session.playthrough_id, connection.to_room_template_id, {
    carryOverParticipants,
    fromRoomSessionId: session.id,
  });

  res.json({ session: newSession, playthrough });
});

roomSessionsRouter.post('/:id/participants/:characterId/accompanying', (req, res) => {
  res.json(setAccompanying(req.params.id, req.params.characterId, Boolean(req.body.is_accompanying)));
});

// Surfaces change_relationship action results as a transient in-chat notice
// (opt-in per World, chat enhancement backlog item 11) — previously these
// happened completely silently. change_relationship's own result already
// carries previous_value/axis_name (added alongside this feature) so no
// extra DB lookups are needed here beyond the character's display name.
function broadcastRelationshipChanges(sessionId, fired) {
  for (const event of fired) {
    for (const actionResult of event.actionResults) {
      if (actionResult.actionType !== 'change_relationship') continue;
      for (const change of actionResult.result?.changes ?? []) {
        if (change.new_value === change.previous_value) continue;
        const character = db.prepare('SELECT name FROM characters WHERE id = ?').get(change.character_id);
        const direction = change.new_value > change.previous_value ? '上がった' : '下がった';
        broadcast(sessionId, {
          type: 'relationship_changed',
          description: `${character?.name ?? '???'}との${change.axis_name}が${direction}`,
        });
      }
    }
  }
}

function fallbackEmotionKey() {
  const row = db.prepare("SELECT llm_tag_key FROM expression_types WHERE name = '通常'").get();
  return row?.llm_tag_key ?? 'normal';
}

async function generateReply(
  sessionId,
  userMessageContent,
  mentionedCharacterIds = null,
  isContinuation = false,
  mentionedInstanceByCharacterId = new Map(),
) {
  const session = getRoomSession(sessionId);
  // A messages array ending on role 'assistant' (i.e. no new user turn at
  // all) reliably returns an EMPTY completion, so a continuation turn has to
  // append SOMETHING. This used to be a lone space, which the project's
  // original model happily continued from — but instruction-tuned models
  // (Gemma etc.) correctly read a blank turn as "the user sent nothing" and
  // answer with a meta-message asking for input instead of advancing the
  // story. Spelling the intent out as a stage direction fixes that while
  // still not reading as an actual player action/line.
  // "@周辺" triggers surroundings-check mode for this turn only (see
  // buildSystemPrompt): narrows ITEM_GRANT to the room's configured
  // categories and surfaces its props/facilities as discoverable — so it
  // asks for a description of the place rather than for the scene to move on.
  const isSurroundingsCheck = typeof userMessageContent === 'string' && userMessageContent.includes('@周辺');
  const ephemeralUserTurn = isContinuation ? (isSurroundingsCheck ? SURROUNDINGS_TURN : CONTINUATION_TURN) : null;

  const worldId = db.prepare('SELECT world_id FROM playthroughs WHERE id = ?').get(session.playthrough_id).world_id;
  const world = getWorld(worldId);
  const maxTokens = world.max_response_tokens;

  // The prompt is sized against the model's real context window, so it needs
  // to know how much room this call will ask back for.
  const built = await buildMultiCharacterMessages(session, {
    ephemeralUserTurn,
    isSurroundingsCheck,
    responseTokenReserve: maxTokens ?? undefined,
  });
  if (!built) return;

  broadcast(sessionId, { type: 'generation_start' });

  const validEmotionKeys = new Set(db.prepare('SELECT llm_tag_key FROM expression_types').all().map((r) => r.llm_tag_key));
  const fallbackKey = fallbackEmotionKey();
  // [POSE:xxx] is optional (see responseParser.js) -- an unrecognized key is
  // simply ignored (no fallback/fold-into-text handling needed, unlike EMOTION).
  // Worldでpose_enabledがfalseの場合はMapを空にし、タグが来ても無視させる
  // （worldsRepo.jsのpose_enabled、1-snoopy-raccoon.mdの追加トグル）。
  const poseIdByLlmTagKey = world.pose_enabled
    ? new Map(db.prepare('SELECT id, llm_tag_key FROM pose_masters').all().map((r) => [r.llm_tag_key, r.id]))
    : new Map();
  // Same disambiguation algorithm as promptBuilder.js's buildSystemPrompt,
  // applied to the same session.participants array — so if two participants
  // share a name, this Map's keys naturally match whatever the model was
  // shown ("みお" / "みお(2)") instead of colliding on the bare name.
  const participantsByName = new Map(withDisambiguatedNames(session.participants).map((p) => [p.display_name, p]));

  // Safety net for when the model doesn't echo back the exact display_name
  // (e.g. it shortens a longer/compound name to just part of it) — falls
  // back to a substring match only when it resolves to exactly one
  // participant, so an ambiguous partial name still falls through to the
  // hallucinated-name handling below rather than guessing wrong.
  function resolveParticipantFuzzy(name) {
    if (participantsByName.has(name)) return participantsByName.get(name);
    const candidates = [...participantsByName.entries()].filter(
      ([displayName]) => displayName.includes(name) || name.includes(displayName),
    );
    return candidates.length === 1 ? candidates[0][1] : null;
  }

  // The system prompt tells the model never to speak/act as the protagonist
  // by name, but small local models don't reliably follow negative
  // instructions — observed live: it still emitted "[<protagonist name>]: ..."
  // lines. Rather than trust the prompt alone, strip any turn attributed to
  // the protagonist's own name/nickname here, since showing the model's
  // made-up dialogue for the player character defeats the point of the
  // protagonist feature (the player's lines must only ever come from them).
  const protagonist = resolveProtagonist(session.playthrough_id);
  const forbiddenNames = new Set(
    protagonist.mode === 'character' ? [protagonist.name, protagonist.nickname].map((s) => s.trim()).filter(Boolean) : [],
  );

  // Which room_session_characters instance most recently spoke, per
  // character_id, over the course of THIS turn's generation -- the fallback
  // signal for mob-instance-aware relationship/address/status actions when
  // the triggering line has no explicit @mention to disambiguate which
  // duplicate instance it should apply to (bugreports 2026-07-19 follow-up).
  const lastSpokenInstanceByCharacter = new Map();

  // Persists + broadcasts one parsed line as soon as it's recognized, so chat
  // bubbles reveal one at a time as the response streams in, instead of all
  // appearing at once after the full response lands.
  function handleParsedLine(parsed) {
    if (!parsed) return;

    if (parsed.type === 'scene_change') {
      broadcast(sessionId, { type: 'scene_change_detected', description: parsed.description });
      enqueueImageJob(() => generateSceneImage(sessionId, parsed.description));
      return;
    }

    if (parsed.type === 'narration') {
      const message = createMessage(sessionId, { sender_type: 'narration', content: parsed.text });
      broadcast(sessionId, { type: 'message_complete', message });
      return;
    }

    if (parsed.type === 'item_grant') {
      // Dynamic item generation (chat enhancement backlog item 9): always
      // scoped to the current room's own World, never the shared-common
      // tier — see findOrCreateWorldItem's own comment for why. The LLM
      // picks a category name from the list shown in the system prompt;
      // resolveCategoryOrFallback falls back to 未分類 if it's missing or
      // doesn't match (typo/hallucination), so an item is never left
      // without a category (and thus without a consumable/not determination).
      const category = resolveCategoryOrFallback(worldId, parsed.categoryName);
      const item = findOrCreateWorldItem(worldId, parsed.itemName, parsed.description, category.id);

      // Shopping (is_shop room + World currency_enabled): a hand-over
      // requires payment instead of being free. buy_price is NULL for
      // anything not registered as a shop product (including any item the
      // LLM just invented on the fly), which is treated as "not for sale"
      // rather than silently falling back to free — otherwise a shop's
      // whole point (nothing leaves without paying) would be trivially
      // bypassable by the model inventing an unpriced item name.
      if (session.room_is_shop && world.currency_enabled) {
        if (item.buy_price == null) {
          const message = createMessage(sessionId, {
            sender_type: 'narration',
            content: `『${item.name}』は売り物ではないようだ。`,
          });
          broadcast(sessionId, { type: 'message_complete', message });
          return;
        }
        const currentMoney = getPlaythrough(session.playthrough_id).money;
        if (item.buy_price > currentMoney) {
          const message = createMessage(sessionId, {
            sender_type: 'narration',
            content: `『${item.name}』（${item.buy_price}${world.currency_unit}）を買うには所持金が足りなかった。`,
          });
          broadcast(sessionId, { type: 'message_complete', message });
          return;
        }
        const money = adjustMoney(session.playthrough_id, -item.buy_price);
        addItemToInventory(session.playthrough_id, item.id);
        const message = createMessage(sessionId, {
          sender_type: 'narration',
          content: `『${item.name}』を${item.buy_price}${world.currency_unit}で購入した。（所持金 ${money}${world.currency_unit}）`,
        });
        broadcast(sessionId, { type: 'message_complete', message });
        broadcast(sessionId, { type: 'money_changed', money });
        return;
      }

      // Outside a shop this no longer hands the item over — it puts it within
      // reach, and the player takes it with 拾う (0072). Shops above are
      // unchanged: paying for something IS the hand-over.
      const found = makeItemAvailable(session.playthrough_id, session.room_template_id, item.id);
      if (!found) return; // 既にこの部屋で見つけてある
      const message = createMessage(sessionId, { sender_type: 'narration', content: `『${item.name}』を見つけた。` });
      broadcast(sessionId, { type: 'message_complete', message });
      return;
    }

    if (parsed.type === 'outfit_grant') {
      // OUTFIT_GRANTは買い物モード限定(promptBuilder.jsのシステムプロンプト指示も
      // 買い物モード時のみ出す)。衣装マスタはitemsのfindOrCreateWorldItemのような
      // 即興作成をしない厳選プリセットのため、名前が一致しなければ「売っていない」
      // 扱いにする——ITEM_GRANTのカテゴリ引数に相当するものが無いのはこのため。
      const master = getMasterByName(parsed.outfitMasterName);
      if (!master || !session.room_is_shop || !world.currency_enabled || master.buy_price == null) {
        const message = createMessage(sessionId, {
          sender_type: 'narration',
          content: `『${parsed.outfitMasterName}』は売り物ではないようだ。`,
        });
        broadcast(sessionId, { type: 'message_complete', message });
        return;
      }
      const currentMoney = getPlaythrough(session.playthrough_id).money;
      if (master.buy_price > currentMoney) {
        const message = createMessage(sessionId, {
          sender_type: 'narration',
          content: `『${master.name}』（${master.buy_price}${world.currency_unit}）を買うには所持金が足りなかった。`,
        });
        broadcast(sessionId, { type: 'message_complete', message });
        return;
      }
      const money = adjustMoney(session.playthrough_id, -master.buy_price);
      addOutfitToInventory(session.playthrough_id, master.id);
      const message = createMessage(sessionId, {
        sender_type: 'narration',
        content: `『${master.name}』を${master.buy_price}${world.currency_unit}で購入した。（所持金 ${money}${world.currency_unit}）`,
      });
      broadcast(sessionId, { type: 'message_complete', message });
      broadcast(sessionId, { type: 'money_changed', money });
      return;
    }

    if (parsed.type === 'stat_change') {
      // Defense in depth: even though promptBuilder.js only teaches the model
      // this tag when the World has opted in, a base model could still emit
      // it unprompted (same class of risk as ITEM_GRANT hallucination) --
      // ignore it outright rather than trust the World toggle was consulted
      // upstream.
      if (!world.self_stat_auto_update_enabled || parsed.delta == null) return;
      const participant = resolveParticipantFuzzy(parsed.characterName);
      const axis = listLlmAutoUpdateEnabledAxes('self_stat').find((a) => a.name === parsed.axisName?.trim());
      // Unresolved character/axis name (hallucination or typo) is silently
      // dropped -- same fallback philosophy as ITEM_GRANT's category miss,
      // but here there's no safe fallback value to apply, so the line is
      // simply not acted on.
      if (!participant || !axis) return;
      const previousValue = getValue(session.playthrough_id, participant.character_id, axis.id, sessionId, participant.id);
      const newValue = adjustValue(
        session.playthrough_id,
        participant.character_id,
        axis.id,
        'add',
        clampLlmDelta(parsed.delta, world.llm_value_delta_cap),
        sessionId,
        participant.id,
      );
      if (world.notify_relationship_changes && newValue !== previousValue) {
        const direction = newValue > previousValue ? '上がった' : '下がった';
        broadcast(sessionId, {
          type: 'relationship_changed',
          description: `${participant.display_name}の${axis.name}が${direction}`,
        });
      }
      return;
    }

    if (forbiddenNames.has(parsed.characterName.trim())) return;

    const participant = resolveParticipantFuzzy(parsed.characterName);
    if (!participant) {
      // Model hallucinated a name that isn't actually present — keep the line
      // visible as narration rather than silently discarding generated content.
      const message = createMessage(sessionId, {
        sender_type: 'narration',
        content: `[${parsed.characterName}]: ${parsed.text}`,
      });
      broadcast(sessionId, { type: 'message_complete', message });
      return;
    }

    let content = parsed.text;
    let emotionTag = fallbackKey;
    if (parsed.emotionKey) {
      if (validEmotionKeys.has(parsed.emotionKey)) {
        emotionTag = parsed.emotionKey;
      } else {
        // Unknown emotion tag: fall back to the default expression image, but
        // keep the model's intended nuance visible by folding it into the
        // dialogue text instead of discarding the line's content.
        content = `${content}（${parsed.emotionKey}）`;
      }
    }

    // [POSE:xxx] is optional and low-frequency by design (1-snoopy-raccoon.md) —
    // only applied when present and recognized; absent or unknown keys leave
    // the current pose untouched (no fold-into-text handling like EMOTION,
    // since omitting it is the expected common case, not a format slip).
    if (parsed.poseKey && poseIdByLlmTagKey.has(parsed.poseKey)) {
      updateParticipantPose(sessionId, participant.character_id, poseIdByLlmTagKey.get(parsed.poseKey));
    }

    // A recognized character name with no actual dialogue after it (format
    // slip, or the model just emitted the tag on its own) would otherwise
    // persist as a real character message with empty content -- a "name
    // only" bubble. Nothing useful to show, so drop the line entirely.
    if (!content.trim()) return;

    lastSpokenInstanceByCharacter.set(participant.character_id, participant.id);

    const message = createMessage(sessionId, {
      sender_type: 'character',
      character_id: participant.character_id,
      content,
      emotion_tag: emotionTag,
      room_session_character_id: participant.id,
    });
    broadcast(sessionId, { type: 'message_complete', message });
  }

  // Refusal detection (0067): a genuine local-model refusal is almost always
  // the ENTIRE response collapsed into one block (no character tag, just an
  // apology/decline sentence), so rather than buffering the whole response
  // (which would sacrifice the one-bubble-at-a-time reveal below), only the
  // FIRST block is held back. As soon as a second block arrives, the
  // response is clearly continuing normally, so both are flushed immediately
  // and every later block streams through as before. Only if the stream
  // ends with exactly one held block do we check it against isRefusalText.
  let heldBlock = null;
  function onNewBlock(parsed) {
    if (!parsed) return;
    if (heldBlock === null) {
      heldBlock = parsed;
      return;
    }
    handleParsedLine(heldBlock);
    heldBlock = null;
    handleParsedLine(parsed);
  }

  let lineBuffer = '';
  const fullText = await generateChatCompletion({
    messages: built.messages,
    stop: ['ユーザー:', 'User:'],
    stream: true,
    ...(maxTokens ? { maxTokens } : {}),
    onToken: (token) => {
      lineBuffer += token;
      let newlineIndex;
      while ((newlineIndex = lineBuffer.indexOf('\n')) !== -1) {
        const line = lineBuffer.slice(0, newlineIndex);
        lineBuffer = lineBuffer.slice(newlineIndex + 1);
        onNewBlock(parseScriptLine(line));
      }
    },
  });
  onNewBlock(parseScriptLine(lineBuffer));

  let refused = false;
  if (heldBlock !== null) {
    if (world.refusal_detection_enabled && isRefusalText(heldBlock.text)) {
      refused = true;
      broadcast(sessionId, { type: 'generation_refused' });
    } else {
      handleParsedLine(heldBlock);
    }
    heldBlock = null;
  }

  if (refused) {
    broadcast(sessionId, { type: 'generation_done' });
    return;
  }

  try {
    // Explicit @mention wins when present (the user pointed at a specific
    // instance); otherwise fall back to whichever instance of that
    // character most recently spoke this turn. Characters that neither
    // spoke nor were mentioned this turn simply have no entry, which
    // downstream mob-instance-aware actions treat as "apply without
    // instance scoping" (today's shared-state behavior, unchanged).
    const instanceHintByCharacterId = new Map([...lastSpokenInstanceByCharacter, ...mentionedInstanceByCharacterId]);

    const fired = await runEventEngine({
      sessionId,
      playthroughId: session.playthrough_id,
      roomTemplateId: session.room_template_id,
      userMessage: userMessageContent,
      aiResponseText: fullText,
      mentionedCharacterIds,
      instanceHintByCharacterId,
    });
    for (const event of fired) {
      broadcast(sessionId, { type: 'event_fired', eventDefinitionId: event.eventDefinitionId, name: event.name });
    }
    if (world.notify_relationship_changes) {
      broadcastRelationshipChanges(sessionId, fired);
    }
  } catch (err) {
    console.error('Event engine run failed:', err);
  }

  try {
    // Periodic relationship auto-update (SPEC.md): no-ops internally unless
    // world.relationship_update_interval_turns worth of user turns have
    // elapsed since this session's last check. Wrapped separately from the
    // event engine's try/catch so a failure here can't be misattributed to
    // it, but for the same reason: must never block the chat response itself.
    await maybeRunRelationshipAutoUpdate(session, world);
  } catch (err) {
    console.error('Relationship auto-update failed:', err);
  }

  broadcast(sessionId, { type: 'generation_done' });
}

async function generateSceneImage(sessionId, sceneChangeDescription) {
  const sceneTags = await suggestSceneTags(sceneChangeDescription);
  const updatedSession = updateSessionScene(sessionId, {
    locationText: sceneChangeDescription,
    locationTags: sceneTags,
  });

  const settings = getImageGenerationSettings('scene');
  const worldId = db.prepare('SELECT world_id FROM playthroughs WHERE id = ?').get(updatedSession.playthrough_id).world_id;
  const stylePrompt = resolveStylePromptForWorld(worldId);
  const tagParts = buildSceneTagParts(updatedSession, updatedSession.participants);
  const prompt = renderPromptTemplate(settings.prompt_template, { style_preset: stylePrompt, ...tagParts });

  const referencePaths = updatedSession.participants
    .map((p) => {
      if (!p.current_outfit_id) return null;
      return db.prepare('SELECT standing_image_path FROM outfits WHERE id = ?').get(p.current_outfit_id)?.standing_image_path;
    })
    .filter(Boolean);

  const format = getImageFormat('scene');
  let finalBuffer;

  if (settings.default_mode === 'prompt_only') {
    finalBuffer = await generateTxt2Image({
      prompt,
      negativePrompt: settings.negative_prompt,
      width: settings.main_width,
      height: settings.main_height,
      steps: settings.steps,
      cfgScale: settings.cfg_scale,
      samplerName: settings.sampler_name,
    });
  } else {
    const { canvasBase64, maskBase64, anchorOffset } = await buildReferenceAnchorCanvas(
      referencePaths,
      settings.main_width,
      settings.main_height,
    );
    const resultBuffer = await generateImage({
      initImageBase64: canvasBase64,
      maskBase64,
      prompt,
      negativePrompt: settings.negative_prompt,
      width: settings.main_width + anchorOffset,
      height: settings.main_height,
      steps: settings.steps,
      cfgScale: settings.cfg_scale,
      denoisingStrength: settings.denoising_strength,
      samplerName: settings.sampler_name,
    });
    finalBuffer = await cropMainRegion(resultBuffer, anchorOffset, settings.main_width, settings.main_height);
  }

  const filePath = await saveGeneratedImage(sessionId, finalBuffer, format);
  const generatedImage = createGeneratedImage({ roomSessionId: sessionId, type: 'scene', prompt, filePath });
  setCurrentSceneImage(sessionId, generatedImage.id);

  const message = createMessage(sessionId, {
    sender_type: 'system',
    content_type: 'image',
    image_id: generatedImage.id,
  });

  broadcast(sessionId, { type: 'message_complete', message });
}
