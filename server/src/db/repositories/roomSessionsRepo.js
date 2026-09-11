import { db } from '../connection.js';
import { getPlaythrough, advanceTime, touchPlaythrough } from './playthroughsRepo.js';
import { carryOverAccompanyingStatuses } from './characterStatusStatesRepo.js';
import { buildStatusSnapshot } from './statusSnapshotRepo.js';
import { getStatusDisplayPreferences } from './statusDisplayPreferencesRepo.js';
import { listDefaultParticipantCharacterIdsForWorldRoom } from './worldRoomSlotAssignmentsRepo.js';
import { isMobCharacter } from './charactersRepo.js';
import { getPersistedOutfit, setPersistedOutfit } from './playthroughCharacterOutfitRepo.js';
import { getPersistedTransformation, setPersistedTransformation } from './playthroughCharacterTransformationRepo.js';
import { ensureImpressionStatesSeeded } from './characterImpressionStatesRepo.js';
import { getOutfit } from './outfitsRepo.js';
import { getActiveOutfitStatusModifiers } from '../../services/outfitTagCategories.js';
import { getWorld } from './worldsRepo.js';
import { cyclePhaseFor, cycleDayFor } from '../../services/fertilityCycle.js';
import { getActivePregnancy, listAwaitingChildAppearance } from './characterPregnanciesRepo.js';
import { pregnancyStateFor, childGrowthStateFor } from '../../services/pregnancy.js';
import { resetRoomItemsIfEnabled } from '../../services/itemDiscovery.js';
import { pickRandomMobFlavorPreset } from './mobFlavorPresetsRepo.js';
import { pickRandomMobNamePreset } from './mobNamePresetsRepo.js';
import { pickRandomMobSurnamePreset } from './mobSurnamePresetsRepo.js';
import { withDisambiguatedNames, participantBaseName } from '../../services/participantNaming.js';

// The 6 OUTFIT_TAG_FIELDS the undress-state ladder tracks (undressState.js's
// 6-track convention, L3.4) -- the fields a 脱衣 action command's
// disturbance_target_field can reference client-side.
const DISTURBABLE_FIELDS = ['clothing_upper_outer', 'clothing_upper', 'underwear_upper', 'clothing_lower_outer', 'clothing_lower', 'underwear_lower'];

// Serializes this participant's current outfit + active undress-ladder
// modifiers into a plain JSON-friendly shape the client can use to decide
// which 脱衣 action commands are currently operable (ChatPage.jsx's
// isDisturbanceCommandVisible) -- reuses getActiveOutfitStatusModifiers
// (outfitTagCategories.js) rather than re-deriving the same suppression/
// disturbance rules on the client.
const EXPRESSION_IMAGES_FOR_OUTFIT = `
  SELECT et.llm_tag_key, oei.image_path
  FROM outfit_expression_images oei
  JOIN expression_types et ON et.id = oei.expression_type_id
  WHERE oei.outfit_id = ?`;

// Expressions are authored per outfit, but in practice only the default outfit
// tends to have a full set — changing into a 私服/水着 outfit used to blank
// every portrait in the chat, since a missing image renders as a grey square.
// Fill the gaps from the character's default outfit, keeping whatever the
// current outfit does have. Still empty if neither has that expression.
function listExpressionImagesWithFallback(outfitId, characterId) {
  if (!outfitId) return [];
  const byTag = new Map();
  for (const row of db.prepare(EXPRESSION_IMAGES_FOR_OUTFIT).all(outfitId)) {
    byTag.set(row.llm_tag_key, row);
  }

  const defaultOutfit = db.prepare('SELECT id FROM outfits WHERE character_id = ? AND is_default = 1').get(characterId);
  if (defaultOutfit && defaultOutfit.id !== outfitId) {
    for (const row of db.prepare(EXPRESSION_IMAGES_FOR_OUTFIT).all(defaultOutfit.id)) {
      if (!byTag.has(row.llm_tag_key)) byTag.set(row.llm_tag_key, row);
    }
  }
  return [...byTag.values()];
}

// Both the 妊娠しやすさ phase and the pregnancy stage are derived, never
// stored, so there's otherwise no way to see what they currently are while
// playing. Surfaced for the chat screen's debug panel only; null whenever the
// World/character has both switched off, so nothing shows up in a normal
// playthrough.
//
// A pregnant character reports the pregnancy instead of the cycle -- saying
// 「最危険」 about someone already pregnant is just wrong.
function buildCycleDebug(participant, playthrough, world) {
  const pregnancy = world.pregnancy_enabled ? getActivePregnancy(playthrough.id, participant.character_id) : null;
  const pregnancyState = pregnancyStateFor(pregnancy, playthrough, world);
  if (pregnancyState) {
    return {
      phase: '妊娠中',
      pregnancy: { stage: pregnancyState.stage, day: pregnancyState.dayInPregnancy, gestationDays: pregnancyState.gestationDays, known: pregnancyState.known },
    };
  }
  const character = db.prepare('SELECT cycle_enabled, cycle_offset_day FROM characters WHERE id = ?').get(participant.character_id);
  const phase = cyclePhaseFor(character, playthrough, world);
  if (!phase) return null;
  const cycleLength = world.cycle_length_days > 0 ? world.cycle_length_days : 28;
  return { phase, dayInCycle: cycleDayFor(playthrough.current_day, character.cycle_offset_day, cycleLength), cycleLength };
}

function buildOutfitDisturbance(participant, session) {
  if (!participant.current_outfit_id) return null;
  const outfit = getOutfit(participant.current_outfit_id);
  const { suppressedFields, disturbedFieldStyles, tornFields } = getActiveOutfitStatusModifiers(participant.character_id, {
    playthroughId: session.playthrough_id,
    roomSessionId: session.id,
  });
  return {
    fieldsPresent: Object.fromEntries(DISTURBABLE_FIELDS.map((f) => [f, Boolean(outfit[f]?.trim())])),
    suppressedFields: [...suppressedFields],
    disturbedFieldStyles: Object.fromEntries(disturbedFieldStyles),
    tornFields: [...tornFields],
    garmentOperations: outfit.garment_operations,
  };
}

const STATUS_DISPLAY_LOCATIONS = ['strip', 'panel', 'chat_log'];
const STATUS_DISPLAY_CATEGORIES = ['self_stat', 'status', 'relationship_stage'];

// World settings are a ceiling, player preferences narrow within it — a
// category is only ever visible when BOTH agree (see 0027_status_display_settings.sql).
function computeStatusDisplayVisibility(worldSettings, playerPrefs) {
  const visibility = {};
  for (const location of STATUS_DISPLAY_LOCATIONS) {
    visibility[location] = {};
    for (const category of STATUS_DISPLAY_CATEGORIES) {
      visibility[location][category] = Boolean(worldSettings[location][category]) && Boolean(playerPrefs[location][category]);
    }
  }
  return visibility;
}

// Mob characters (characters.is_mob) are seeded per room_session instead of
// per playthrough, so a fresh session always starts them at their defaults
// again -- see 0041_mob_characters.sql / relationshipStatesRepo.js.
//
// roomSessionCharacterId (2026-07-19, migration 0045): when a mob has
// multiple simultaneous duplicate instances in one session, each instance
// needs its OWN seeding check -- otherwise the first instance seeded would
// make every later duplicate look "already seeded" and it would silently
// get no relationship_states row at all. Non-mob characters ignore this
// param entirely (they're never duplicated, scope stays playthrough-wide).
export function ensureRelationshipStatesSeeded(playthroughId, characterId, roomSessionId, roomSessionCharacterId) {
  const isMob = isMobCharacter(characterId);
  const alreadySeeded = isMob
    ? db
        .prepare('SELECT 1 FROM relationship_states WHERE room_session_id = ? AND character_id = ? AND room_session_character_id IS ? LIMIT 1')
        .get(roomSessionId, characterId, roomSessionCharacterId ?? null)
    : db.prepare('SELECT 1 FROM relationship_states WHERE playthrough_id = ? AND character_id = ? LIMIT 1').get(playthroughId, characterId);
  if (alreadySeeded) return;
  const defaults = db
    .prepare('SELECT relationship_axis_id, initial_value FROM character_relationship_defaults WHERE character_id = ?')
    .all(characterId);
  for (const d of defaults) {
    db.prepare(
      `INSERT INTO relationship_states (playthrough_id, room_session_id, room_session_character_id, character_id, relationship_axis_id, current_value)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      isMob ? null : playthroughId,
      isMob ? roomSessionId : null,
      isMob ? roomSessionCharacterId ?? null : null,
      characterId,
      d.relationship_axis_id,
      d.initial_value,
    );
  }
}

// Returns both `participants` (currently active only -- the existing
// semantics every other UI usage relies on: the top strip, status panel,
// mention buttons, action-command gating, item-transfer targets) and
// `all_participants` (active + departed) for name/expression-image
// resolution of past chat messages, which must still work after a character
// leaves (see bugreports_2026-07-19). left_at/current_outfit_id are
// preserved on departure (removeParticipant only flips is_active), so a
// departed row still resolves a sensible expression image.
function attachParticipants(session) {
  if (!session) return session;
  const allParticipants = db
    .prepare(
      `SELECT rsc.id, rsc.character_id, COALESCE(NULLIF(ct.name, ''), c.name) AS name, c.is_mob,
              rsc.current_outfit_id, rsc.current_transformation_id, rsc.current_pose_id, rsc.is_active, rsc.is_accompanying,
              rsc.auto_outfit_image_last_turn, rsc.mob_flavor_preset_id, rsc.mob_flavor_name_id, rsc.mob_flavor_surname_id,
              mnp.name AS mob_flavor_name, msp.surname AS mob_flavor_surname,
              mfp.personality AS mob_flavor_personality, mfp.speech_style AS mob_flavor_speech_style,
              mfp.sentence_ending AS mob_flavor_sentence_ending, mfp.first_person AS mob_flavor_first_person,
              mfp.call_user_as AS mob_flavor_call_user_as, mfp.call_others_as AS mob_flavor_call_others_as
       FROM room_session_characters rsc
       JOIN characters c ON c.id = rsc.character_id
       LEFT JOIN character_transformations ct ON ct.id = rsc.current_transformation_id
       LEFT JOIN mob_flavor_presets mfp ON mfp.id = rsc.mob_flavor_preset_id
       LEFT JOIN mob_name_presets mnp ON mnp.id = rsc.mob_flavor_name_id
       LEFT JOIN mob_surname_presets msp ON msp.id = rsc.mob_flavor_surname_id
       WHERE rsc.room_session_id = ?`,
    )
    .all(session.id);

  // Shared by every participant's cycle_debug below — looked up once rather
  // than per participant.
  const cyclePlaythrough = getPlaythrough(session.playthrough_id);
  const cycleWorld = getWorld(cyclePlaythrough.world_id);

  for (const participant of allParticipants) {
    participant.expression_images = listExpressionImagesWithFallback(
      participant.current_outfit_id,
      participant.character_id,
    );
    participant.status = buildStatusSnapshot(session.playthrough_id, participant.character_id, {
      roomSessionId: session.id,
      roomSessionCharacterId: participant.id,
    });
    participant.outfit_disturbance = buildOutfitDisturbance(participant, session);
    participant.cycle_debug = buildCycleDebug(participant, cyclePlaythrough, cycleWorld);
  }

  const participants = allParticipants.filter((p) => p.is_active);

  // display_name: 送信文の@メンション照合(resolveMentions())・chat UIの表示に
  // 常に使う「実際にどう呼ばれているか」の名前。参加中はwithDisambiguatedNames
  // でA/B連番・同名(2)まで解決したもの(promptBuilder.jsがLLMに見せる名前と
  // 完全に一致させる必要がある——ずれるとクライアントが送った@メンションが
  // サーバー側で解決できなくなる、実際に起きた不具合)。退室済み(all_participants
  // のみに残る行)は連番の対象外なのでベース名のみ。
  const displayNameByRowId = new Map(withDisambiguatedNames(participants).map((p) => [p.id, p.display_name]));
  for (const participant of allParticipants) {
    participant.display_name = displayNameByRowId.get(participant.id) ?? participantBaseName(participant);
  }

  const worldRow = db
    .prepare('SELECT w.status_display_settings FROM worlds w JOIN playthroughs p ON p.world_id = w.id WHERE p.id = ?')
    .get(session.playthrough_id);
  const worldSettings = JSON.parse(worldRow.status_display_settings);
  const playerPrefs = getStatusDisplayPreferences();
  const status_display_visibility = computeStatusDisplayVisibility(worldSettings, playerPrefs);

  return {
    ...session,
    participants,
    all_participants: allParticipants,
    status_display_visibility,
    pending_children: buildPendingChildren(cyclePlaythrough, cycleWorld),
  };
}

// 出産済みでまだ登場していない子の一覧。エンジンは臨月を見て勝手に出産させも
// しないし、成育日数が過ぎたからといって勝手にキャラを作りもしない——
// 「そろそろ戻る頃合いだ」と知らせるところまでが機構の仕事で、実際にキャラを
// 起こすのは次の塊(P7)でプレイヤーが確定させる。
function buildPendingChildren(playthrough, world) {
  if (!world.pregnancy_enabled || !['early', 'on_time_skip'].includes(world.child_appearance)) return [];
  return listAwaitingChildAppearance(playthrough.id)
    .map((pregnancy) => {
      const growth = childGrowthStateFor(pregnancy, playthrough, world);
      if (!growth) return null;
      const mother = db.prepare('SELECT name FROM characters WHERE id = ?').get(pregnancy.character_id);
      return {
        pregnancy_id: pregnancy.id,
        mother_character_id: pregnancy.character_id,
        mother_name: mother?.name ?? '???',
        child_name: pregnancy.child_name,
        child_gender: pregnancy.child_gender,
        ...growth,
      };
    })
    .filter(Boolean);
}

// Lists every session (active or ended) a playthrough has ever had, newest
// first — the browsable "log" of past room/place visits (Room→Place design
// decision: sessions still reset on each move, but their message history
// stays reachable afterward rather than becoming permanently invisible).
//
// 「切らない」セッション境界モード(0122)では1つのroom_sessionが複数の
// ログ日(messages.game_day)にまたがるため、(セッション, ログ日)の組で1行に
// する——LEFT JOIN + GROUP BYで、メッセージが1件も無いセッションもgame_day=NULL
// の1行として残る(クライアントはentered_dayにフォールバックする)。
export function listSessionsForPlaythrough(playthroughId) {
  return db
    .prepare(
      `SELECT rs.id, rs.room_template_id, rt.name AS room_name, rs.status,
              rs.entered_day, rs.entered_time_slot_index, rs.log_day, rs.started_at, rs.updated_at,
              m.game_day, COUNT(m.id) AS message_count
       FROM room_sessions rs
       JOIN room_templates rt ON rt.id = rs.room_template_id
       LEFT JOIN messages m ON m.room_session_id = rs.id
       WHERE rs.playthrough_id = ?
       GROUP BY rs.id, m.game_day
       ORDER BY rs.started_at DESC, m.game_day DESC`,
    )
    .all(playthroughId);
}

// A playthrough is only ever meant to have one active session, but nothing
// enforced that historically, and without an explicit order SQLite hands back
// the lowest rowid — i.e. the OLDEST. Resuming a route then dropped the player
// into a stale room instead of the one they left off in. Ordering newest-first
// both fixes that and repairs any duplicates already sitting in a save.
export function getActiveSessionForPlaythrough(playthroughId) {
  const row = db
    .prepare("SELECT * FROM room_sessions WHERE playthrough_id = ? AND status = 'active' ORDER BY id DESC")
    .get(playthroughId);
  return attachParticipants(row);
}

export function getRoomSession(id) {
  const row = db
    .prepare(
      `SELECT rs.*, rt.background_image_path AS room_background_image_path, rt.is_place AS room_is_place, rt.is_shop AS room_is_shop, rt.outfit_acquisition_mode AS room_outfit_acquisition_mode, gi.file_path AS current_scene_image_path
       FROM room_sessions rs
       JOIN room_templates rt ON rt.id = rs.room_template_id
       LEFT JOIN generated_images gi ON gi.id = rs.current_scene_image_id
       WHERE rs.id = ?`,
    )
    .get(id);
  return attachParticipants(row);
}

// options.carryOverParticipants: participants from a session being left via
// a move-to-connected-place action (room移動), whose is_accompanying flag was
// set — they join the new session's cast alongside its own default
// participants, keeping the accompanying flag so they continue to follow
// through further moves. Unflagged participants from the old session are
// simply left behind (never passed in).
// options.fromRoomSessionId: the session being left, used to carry forward
// each carried-over character's 'accompanying'-scoped character statuses
// (session/playthrough-scoped statuses reset or persist on their own terms).
export function createRoomSession(playthroughId, roomTemplateId, options = {}) {
  const playthrough = getPlaythrough(playthroughId);
  const template = db.prepare('SELECT * FROM room_templates WHERE id = ?').get(roomTemplateId);
  resetRoomItemsIfEnabled(playthroughId, roomTemplateId);
  // ポーズ機構がWorldで無効なら常にnull（1-snoopy-raccoon.mdの機構自体はグローバル
  // だが、Worldごとの利用有無はこのフラグでゲートする）。
  const poseEnabled = Boolean(getWorld(playthrough.world_id)?.pose_enabled);
  const defaultPoseId = poseEnabled ? (template.default_pose_id ?? null) : null;

  const result = db
    .prepare(
      `INSERT INTO room_sessions
        (room_template_id, playthrough_id, entered_day, entered_time_slot_index, log_day,
         current_location_text, current_location_tags, current_atmosphere_text, current_atmosphere_tags, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    )
    .run(
      roomTemplateId,
      playthroughId,
      playthrough.current_day,
      playthrough.current_time_slot_index,
      playthrough.current_day,
      template.location_text,
      template.location_tags,
      template.atmosphere_text,
      template.atmosphere_tags,
    );
  const sessionId = result.lastInsertRowid;

  seedParticipantsForRoom(sessionId, playthrough, template, defaultPoseId, options);

  touchPlaythrough(playthroughId);
  return getRoomSession(sessionId);
}

// createRoomSession(新セッション)と switchRoomWithinSession(継続セッション内で
// 部屋だけ差し替え、0121)の両方から使う同席キャラの積み込み。衣装/変身/ポーズの
// 優先順位と各種stateのseedを2箇所で二重管理しないために切り出してある。
function seedParticipantsForRoom(sessionId, playthrough, template, defaultPoseId, options = {}) {
  const playthroughId = playthrough.id;
  const world = getWorld(playthrough.world_id);
  const carryOverByCharacterId = new Map(
    (options.carryOverParticipants ?? []).map((p) => [p.character_id, p]),
  );

  // 継続セッションで部屋を差し替える場合、同行中のキャラは既にこのセッションの
  // 行として在籍している。移動先の既定キャストにその同じキャラが含まれていると
  // 二重に積んでしまうので、同行フラグ付きで在籍中の分は飛ばす。モブの重複出演
  // (同じcharacter_idが複数インスタンスとして並ぶ、0043)は is_accompanying=0 な
  // ので、この条件では弾かれない。
  const alreadyAccompanying = new Set(
    db
      .prepare('SELECT character_id FROM room_session_characters WHERE room_session_id = ? AND is_active = 1 AND is_accompanying = 1')
      .all(sessionId)
      .map((r) => r.character_id),
  );

  // Default participants are now resolved per-World: the room master only
  // declares abstract slots (room_template_participant_slots), and which
  // concrete character fills each slot is a per-World decision
  // (world_room_slot_assignments) — see 0030_room_world_decoupling.sql.
  // suppress_auto_population rooms (e.g. ホテルの部屋) skip this entirely —
  // only characters explicitly accompanying the player (handled below) may
  // ever be present, no tag-matched/random NPC can interrupt.
  const defaultParticipantIds = template.suppress_auto_population
    ? []
    : listDefaultParticipantCharacterIdsForWorldRoom(
        playthrough.world_id,
        template.id,
        playthrough.current_time_slot_index,
        playthroughId,
      );
  for (const characterId of defaultParticipantIds) {
    if (alreadyAccompanying.has(characterId)) {
      carryOverByCharacterId.delete(characterId);
      continue;
    }
    const carryOver = carryOverByCharacterId.get(characterId);
    const defaultOutfit = db
      .prepare('SELECT id FROM outfits WHERE character_id = ? AND is_default = 1')
      .get(characterId);
    const persisted = isMobCharacter(characterId) ? null : getPersistedOutfit(playthroughId, characterId);
    const persistedTransformation = isMobCharacter(characterId) ? null : getPersistedTransformation(playthroughId, characterId);
    // 同行済みの持ち越し(carryOver)がある場合は既に持っていたペルソナ・名前を
    // そのまま引き継ぐ(新規抽選しない)。そうでない新規登場のモブだけ、Worldが
    // presetモードならその場でペルソナ・名前をそれぞれ独立に抽選する(0129、
    // 紐付けない=片方だけ抽選できていても構わない)。llmモードはここでは両方
    // NULLのままにし、呼び出し元(roomSessions.jsルート)がレスポンス送出後に
    // 非同期生成する。
    let mobFlavorPresetId = carryOver?.mob_flavor_preset_id ?? null;
    let mobFlavorNameId = carryOver?.mob_flavor_name_id ?? null;
    let mobFlavorSurnameId = carryOver?.mob_flavor_surname_id ?? null;
    if (!carryOver && world.mob_flavor_mode === 'preset' && isMobCharacter(characterId)) {
      mobFlavorPresetId = pickRandomMobFlavorPreset(playthrough.world_id)?.id ?? null;
      mobFlavorNameId = pickRandomMobNamePreset(playthrough.world_id)?.id ?? null;
      mobFlavorSurnameId = pickRandomMobSurnamePreset(playthrough.world_id)?.id ?? null;
    }
    const rscResult = db
      .prepare(
        'INSERT INTO room_session_characters (room_session_id, character_id, current_outfit_id, current_transformation_id, current_pose_id, is_active, is_accompanying, mob_flavor_preset_id, mob_flavor_name_id, mob_flavor_surname_id) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)',
      )
      .run(
        sessionId,
        characterId,
        carryOver?.current_outfit_id ?? persisted?.outfit_id ?? defaultOutfit?.id ?? null,
        carryOver?.current_transformation_id ?? persistedTransformation?.transformation_id ?? null,
        // ポーズはセッションをまたいで持ち越さない（playthrough単位の永続化テーブルは
        // 意図的に作っていない）——常にこの部屋の初期ポーズから始まる（World側で無効なら常にnull）。
        defaultPoseId,
        carryOver ? 1 : 0,
        mobFlavorPresetId,
        mobFlavorNameId,
        mobFlavorSurnameId,
      );
    ensureRelationshipStatesSeeded(playthroughId, characterId, sessionId, rscResult.lastInsertRowid);
    ensureImpressionStatesSeeded(playthroughId, characterId, sessionId, rscResult.lastInsertRowid);
    if (carryOver && options.fromRoomSessionId != null) {
      carryOverAccompanyingStatuses(characterId, options.fromRoomSessionId, sessionId);
    }
    carryOverByCharacterId.delete(characterId);
  }

  // Remaining carry-over participants aren't part of the new room's own cast
  // — they're only present because they're accompanying the player.
  for (const carryOver of carryOverByCharacterId.values()) {
    if (alreadyAccompanying.has(carryOver.character_id)) continue;
    const rscResult = db
      .prepare(
        'INSERT INTO room_session_characters (room_session_id, character_id, current_outfit_id, current_transformation_id, current_pose_id, is_active, is_accompanying, mob_flavor_preset_id, mob_flavor_name_id, mob_flavor_surname_id) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?)',
      )
      .run(
        sessionId,
        carryOver.character_id,
        carryOver.current_outfit_id ?? null,
        carryOver.current_transformation_id ?? null,
        defaultPoseId,
        carryOver.mob_flavor_preset_id ?? null,
        carryOver.mob_flavor_name_id ?? null,
        carryOver.mob_flavor_surname_id ?? null,
      );
    ensureRelationshipStatesSeeded(playthroughId, carryOver.character_id, sessionId, rscResult.lastInsertRowid);
    ensureImpressionStatesSeeded(playthroughId, carryOver.character_id, sessionId, rscResult.lastInsertRowid);
    if (options.fromRoomSessionId != null) {
      carryOverAccompanyingStatuses(carryOver.character_id, options.fromRoomSessionId, sessionId);
    }
  }
}

// 継続セッション(worlds.continuous_room_session_enabled、0121)での部屋移動。
// セッション行はそのままに、部屋だけを差し替える——会話履歴が room_session_id で
// 引かれている以上、セッションを畳まないことがそのまま「部屋をまたいで文脈が
// 繋がる」という効果になる。
export function switchRoomWithinSession(sessionId, toRoomTemplateId) {
  const session = db.prepare('SELECT * FROM room_sessions WHERE id = ?').get(sessionId);
  const playthrough = getPlaythrough(session.playthrough_id);
  const template = db.prepare('SELECT * FROM room_templates WHERE id = ?').get(toRoomTemplateId);
  // 「入室のたびに探索候補を引き直す」設定は部屋単位の意味なので、セッションを
  // 跨いでもここで従来どおり効かせる。
  resetRoomItemsIfEnabled(session.playthrough_id, toRoomTemplateId);

  // 同行していないキャラはこの場に置いていく。行を消さずに退室扱いにするのは、
  // 発言メッセージが room_session_character_id を参照しているため(と、プロンプト
  // 側の「もう居ないので喋らせるな」リストがこの状態を見ているため)。
  db.prepare(
    `UPDATE room_session_characters SET is_active = 0, left_at = datetime('now')
     WHERE room_session_id = ? AND is_active = 1 AND is_accompanying = 0`,
  ).run(sessionId);

  const poseEnabled = Boolean(getWorld(playthrough.world_id)?.pose_enabled);
  const defaultPoseId = poseEnabled ? (template.default_pose_id ?? null) : null;

  // entered_day/entered_time_slot_index は「このセッションが始まった時点」を指す
  // ため触らない——継続モードのセッション境界判定(時間帯が変わったか)がこの値を
  // 基準にしている。log_day/boundary_pending(0122)も同じ理由で触らない——
  // 「ログの日替わり」「保留中の区切り」はどちらも部屋移動そのものとは独立した
  // 状態で、handleDayRollover/evaluateBoundary(sessionBoundary.js)だけが進める。
  db.prepare(
    `UPDATE room_sessions
     SET room_template_id = ?, current_location_text = ?, current_location_tags = ?,
         current_atmosphere_text = ?, current_atmosphere_tags = ?, current_scene_situation = '',
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    toRoomTemplateId,
    template.location_text,
    template.location_tags,
    template.atmosphere_text,
    template.atmosphere_tags,
    sessionId,
  );

  seedParticipantsForRoom(sessionId, playthrough, template, defaultPoseId);
  touchPlaythrough(session.playthrough_id);
  return getRoomSession(sessionId);
}

export function exitRoomSession(id) {
  const session = getRoomSession(id);
  db.prepare(`UPDATE room_sessions SET status = 'ended', updated_at = datetime('now') WHERE id = ?`).run(id);
  const updatedPlaythrough = advanceTime(session.playthrough_id, 1);
  return { session: getRoomSession(id), playthrough: updatedPlaythrough };
}

// Ends a session as part of a room連結 move (room移動) rather than a full
// exit — deliberately does NOT advance time itself; the caller applies the
// connection's movement_cost via playthroughsRepo.applyMovementCost instead,
// which only advances a time-slot once the sub-count budget is exhausted.
export function endSessionForMove(id) {
  db.prepare(`UPDATE room_sessions SET status = 'ended', updated_at = datetime('now') WHERE id = ?`).run(id);
  return getRoomSession(id);
}

// Bookkeeping for the LLM relationship-value auto-update mechanism (SPEC.md):
// countUserTurnsForPlaythrough() value as of the last time this session ran
// the periodic/catch-up update, so the next check knows how many turns have
// elapsed since. getRoomSession() already returns this column as-is via its
// `SELECT rs.*` (see roomSessionsRepo.js's getRoomSession), so no extra read
// path is needed beyond this setter.
export function setRelationshipUpdateCheckpoint(sessionId, turnNumber) {
  db.prepare('UPDATE room_sessions SET relationship_update_last_turn = ? WHERE id = ?').run(turnNumber, sessionId);
}

// 記憶抽出・印象更新のターン数間隔実行(0121)用チェックポイント。上の関係値版と
// 同じく countUserTurnsForPlaythrough() の値を覚えておくだけ。
export function setMemoryImpressionCheckpoint(sessionId, turnNumber) {
  db.prepare('UPDATE room_sessions SET memory_impression_last_turn = ? WHERE id = ?').run(turnNumber, sessionId);
}

// 会話の要約(0121)。conversation_summary は毎回まるごと差し替え(前回のあらすじを
// 土台にLLMが畳み直した新しい全文)、last_message_id はどこまで畳み込んだかの目印。
export function setConversationSummary(sessionId, summary, lastMessageId) {
  db.prepare('UPDATE room_sessions SET conversation_summary = ?, conversation_summary_last_message_id = ? WHERE id = ?').run(
    summary,
    lastMessageId,
    sessionId,
  );
}

// セッション境界モード(0122)用チェックポイント。log_dayは「このセッションの
// ログが今どの日に居るか」——handleDayRollover(sessionBoundary.js)が日替わりの
// 区切り行を入れる直前にだけ進める(createRoomSessionの初期値はentered_dayと同じ)。
export function setLogDay(sessionId, day) {
  db.prepare('UPDATE room_sessions SET log_day = ? WHERE id = ?').run(day, sessionId);
}

// 保留中の区切り理由('' = なし)。会話の途中では区切らず次の/move・/exitで
// 消費させたい時にevaluateBoundaryがセットする。
export function setBoundaryPending(sessionId, reason) {
  db.prepare('UPDATE room_sessions SET boundary_pending = ? WHERE id = ?').run(reason ?? '', sessionId);
}

// 脱衣・着替え時の自動画像生成(0125)のクールダウン用チェックポイント。キャラ単位
// (room_session_characters行単位)——脱衣状態がキャラごとに独立しているため、
// relationship_update_last_turn等のセッション単位のチェックポイントとは別に
// 参加者テーブル側に持つ。
export function setAutoOutfitImageCheckpoint(roomSessionCharacterId, turnNumber) {
  db.prepare('UPDATE room_session_characters SET auto_outfit_image_last_turn = ? WHERE id = ?').run(turnNumber, roomSessionCharacterId);
}

// モブのランダムペルソナ(0127)のLLM生成モードが、非同期生成完了後に反映する。
// ペルソナ(presetId)と名前(nameId)は0129で独立プールに分かれたため、それぞれ
// 個別にNULLのままなら書く(片方だけ先に決まっている場合でも、もう片方だけ
// 反映できる)。まだ他の処理(お気に入り昇格でNULLに戻された等)によって
// 奪われていないことをWHERE句自体で確認してから書く。戻り値は実際に
// 何かしら反映できたか(falseなら、既に退出済み/昇格済み等で何もしなかった)。
export function setParticipantMobFlavorIfUnset(roomSessionCharacterId, { presetId = null, nameId = null } = {}) {
  let changed = false;
  if (presetId != null) {
    const result = db
      .prepare('UPDATE room_session_characters SET mob_flavor_preset_id = ? WHERE id = ? AND mob_flavor_preset_id IS NULL')
      .run(presetId, roomSessionCharacterId);
    changed = changed || result.changes > 0;
  }
  if (nameId != null) {
    const result = db
      .prepare('UPDATE room_session_characters SET mob_flavor_name_id = ? WHERE id = ? AND mob_flavor_name_id IS NULL')
      .run(nameId, roomSessionCharacterId);
    changed = changed || result.changes > 0;
  }
  return changed;
}

// お気に入り昇格(mobPromotion.js)専用。この参加インスタンスを以後、新しく
// 実体化した永続キャラ扱いに切り替える——ペルソナ・名前・苗字は新キャラ自身の
// 項目に焼き込み済みなのでmob_flavor_preset_id/mob_flavor_name_id/
// mob_flavor_surname_idは全て外す。
export function repointParticipantCharacter(roomSessionCharacterId, newCharacterId) {
  db.prepare(
    'UPDATE room_session_characters SET character_id = ?, mob_flavor_preset_id = NULL, mob_flavor_name_id = NULL, mob_flavor_surname_id = NULL WHERE id = ?',
  ).run(newCharacterId, roomSessionCharacterId);
}

// roomSessionCharacterId(任意): 同一character_idのモブが同一部屋に複数同時に
// 居る場合、指定するとその1インスタンスだけを更新する。未指定時は従来どおり
// character_id一致の全行に効く(後方互換、通常キャラは重複しないので実質同じ)。
export function setAccompanying(sessionId, characterId, isAccompanying, roomSessionCharacterId = null) {
  if (roomSessionCharacterId != null) {
    db.prepare('UPDATE room_session_characters SET is_accompanying = ? WHERE room_session_id = ? AND character_id = ? AND id = ?').run(
      isAccompanying ? 1 : 0,
      sessionId,
      characterId,
      roomSessionCharacterId,
    );
  } else {
    db.prepare('UPDATE room_session_characters SET is_accompanying = ? WHERE room_session_id = ? AND character_id = ?').run(
      isAccompanying ? 1 : 0,
      sessionId,
      characterId,
    );
  }
  return getRoomSession(sessionId);
}

export function touchRoomSession(id) {
  db.prepare(`UPDATE room_sessions SET updated_at = datetime('now') WHERE id = ?`).run(id);
}

// Applies a detected [SCENE_CHANGE] to the session's tracked scene state, so
// subsequent image-generation prompts (and the LLM's own context on the next
// turn) reflect the new location rather than the room template's original one.
export function updateSessionScene(id, { locationText, locationTags }) {
  db.prepare(
    `UPDATE room_sessions SET current_location_text = ?, current_location_tags = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(locationText, locationTags, id);
  return getRoomSession(id);
}

export function setCurrentSceneImage(id, generatedImageId) {
  db.prepare('UPDATE room_sessions SET current_scene_image_id = ? WHERE id = ?').run(generatedImageId, id);
}

// Adds a character to a live session (event action character_join), or
// reactivates one who previously left. Also seeds relationship_states for the
// playthrough if this is the character's first appearance in this route.
export function addParticipant(sessionId, characterId, outfitId = null) {
  const session = db.prepare('SELECT playthrough_id, room_template_id FROM room_sessions WHERE id = ?').get(sessionId);
  const world = getWorld(getPlaythrough(session.playthrough_id).world_id);
  const persisted = isMobCharacter(characterId) ? null : getPersistedOutfit(session.playthrough_id, characterId);
  const resolvedOutfitId = outfitId ?? persisted?.outfit_id ?? db.prepare('SELECT id FROM outfits WHERE character_id = ? AND is_default = 1').get(characterId)?.id ?? null;
  const persistedTransformation = isMobCharacter(characterId) ? null : getPersistedTransformation(session.playthrough_id, characterId);
  const resolvedTransformationId = persistedTransformation?.transformation_id ?? null;
  // 途中参加もこの部屋の初期ポーズから始まる（createRoomSessionと同じ方針、World側で無効なら常にnull）。
  const playthroughForPose = getPlaythrough(session.playthrough_id);
  const posePermittedForParticipant = Boolean(getWorld(playthroughForPose.world_id)?.pose_enabled);
  const resolvedPoseId = posePermittedForParticipant
    ? db.prepare('SELECT default_pose_id FROM room_templates WHERE id = ?').get(session.room_template_id)?.default_pose_id ?? null
    : null;
  // seedParticipantsForRoomと同じ分岐(presetモードはペルソナ・名前をそれぞれ
  // 独立に抽選、llmモードは両方NULLのまま呼び出し元がキックする)。途中参加は
  // 同行キャラの持ち越しが無いので(carryOver概念が無い)、is_mobなら常にこの場で
  // 決める。
  const mobFlavorPresetId =
    isMobCharacter(characterId) && world.mob_flavor_mode === 'preset' ? pickRandomMobFlavorPreset(world.id)?.id ?? null : null;
  const mobFlavorNameId =
    isMobCharacter(characterId) && world.mob_flavor_mode === 'preset' ? pickRandomMobNamePreset(world.id)?.id ?? null : null;
  const mobFlavorSurnameId =
    isMobCharacter(characterId) && world.mob_flavor_mode === 'preset' ? pickRandomMobSurnamePreset(world.id)?.id ?? null : null;
  const existing = db
    .prepare('SELECT id FROM room_session_characters WHERE room_session_id = ? AND character_id = ? LIMIT 1')
    .get(sessionId, characterId);
  let roomSessionCharacterId = existing?.id;
  if (existing) {
    db.prepare(
      `UPDATE room_session_characters SET is_active = 1, current_outfit_id = ?, current_transformation_id = ?, current_pose_id = ?, joined_at = datetime('now'), left_at = NULL, mob_flavor_preset_id = ?, mob_flavor_name_id = ?, mob_flavor_surname_id = ?
       WHERE id = ?`,
    ).run(resolvedOutfitId, resolvedTransformationId, resolvedPoseId, mobFlavorPresetId, mobFlavorNameId, mobFlavorSurnameId, existing.id);
  } else {
    const rscResult = db
      .prepare(
        'INSERT INTO room_session_characters (room_session_id, character_id, current_outfit_id, current_transformation_id, current_pose_id, is_active, mob_flavor_preset_id, mob_flavor_name_id, mob_flavor_surname_id) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
      )
      .run(sessionId, characterId, resolvedOutfitId, resolvedTransformationId, resolvedPoseId, mobFlavorPresetId, mobFlavorNameId, mobFlavorSurnameId);
    roomSessionCharacterId = rscResult.lastInsertRowid;
  }
  ensureRelationshipStatesSeeded(session.playthrough_id, characterId, sessionId, roomSessionCharacterId);
  ensureImpressionStatesSeeded(session.playthrough_id, characterId, sessionId, roomSessionCharacterId);
  return getRoomSession(sessionId);
}

// roomSessionCharacterId(任意): setAccompanyingと同じインスタンス精度オプション。
export function removeParticipant(sessionId, characterId, roomSessionCharacterId = null) {
  if (roomSessionCharacterId != null) {
    db.prepare(
      `UPDATE room_session_characters SET is_active = 0, left_at = datetime('now')
       WHERE room_session_id = ? AND character_id = ? AND id = ?`,
    ).run(sessionId, characterId, roomSessionCharacterId);
  } else {
    db.prepare(
      `UPDATE room_session_characters SET is_active = 0, left_at = datetime('now')
       WHERE room_session_id = ? AND character_id = ?`,
    ).run(sessionId, characterId);
  }
  return getRoomSession(sessionId);
}

export function updateParticipantOutfit(sessionId, characterId, outfitId) {
  db.prepare('UPDATE room_session_characters SET current_outfit_id = ? WHERE room_session_id = ? AND character_id = ?').run(
    outfitId,
    sessionId,
    characterId,
  );
  if (!isMobCharacter(characterId)) {
    const session = db.prepare('SELECT playthrough_id FROM room_sessions WHERE id = ?').get(sessionId);
    setPersistedOutfit(session.playthrough_id, characterId, outfitId);
  }
  return getRoomSession(sessionId);
}

export function updateParticipantTransformation(sessionId, characterId, transformationId) {
  db.prepare('UPDATE room_session_characters SET current_transformation_id = ? WHERE room_session_id = ? AND character_id = ?').run(
    transformationId,
    sessionId,
    characterId,
  );
  if (!isMobCharacter(characterId)) {
    const session = db.prepare('SELECT playthrough_id FROM room_sessions WHERE id = ?').get(sessionId);
    setPersistedTransformation(session.playthrough_id, characterId, transformationId);
  }
  return getRoomSession(sessionId);
}

// outfit/transformationと違い、ポーズはplaythrough単位で持ち越さない（意図的な
// 設計、1-snoopy-raccoon.md参照）——部屋を移動すれば常にその部屋のdefault_pose_id
// にリセットされる。ここではセッション内の一時更新のみを行う。
export function updateParticipantPose(sessionId, characterId, poseId) {
  db.prepare('UPDATE room_session_characters SET current_pose_id = ? WHERE room_session_id = ? AND character_id = ?').run(
    poseId,
    sessionId,
    characterId,
  );
  return getRoomSession(sessionId);
}
