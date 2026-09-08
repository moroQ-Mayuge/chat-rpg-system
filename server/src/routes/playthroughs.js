import { Router } from 'express';
import {
  listPlaythroughsForWorld,
  getPlaythrough,
  createPlaythrough,
  updateProtagonistSettings,
  deletePlaythrough,
} from '../db/repositories/playthroughsRepo.js';
import { getActiveSessionForPlaythrough, createRoomSession, listSessionsForPlaythrough } from '../db/repositories/roomSessionsRepo.js';
import { listInventoryForPlaythrough, addItemToInventory, removeItemFromInventory, transferItem } from '../db/repositories/inventoryRepo.js';
import {
  listOutfitInventoryForPlaythrough,
  addOutfitToInventory,
  transferOutfitItem,
} from '../db/repositories/playthroughOutfitInventoryRepo.js';
import { isRoomInWorld } from '../db/repositories/worldRoomTemplatesRepo.js';
import { getWorld } from '../db/repositories/worldsRepo.js';
import { triggerPendingMobFlavorGeneration } from '../services/mobPersonaGeneration.js';
import {
  listMemoriesForPlaythrough,
  addMemory,
  updateMemory,
  deleteMemory,
  formatOccurredLabel,
} from '../db/repositories/characterMemoriesRepo.js';
import {
  listValuesForPlaythrough as listRelationshipValuesForPlaythrough,
  adjustValue as adjustRelationshipValue,
} from '../db/repositories/relationshipStatesRepo.js';
import {
  listValuesForPlaythrough as listImpressionValuesForPlaythrough,
  setImpressionValue,
} from '../db/repositories/characterImpressionStatesRepo.js';
import { materializeChild } from '../services/childCharacter.js';
import { exportPlaythroughBundle } from '../services/contentBundle/index.js';

export const playthroughsRouter = Router();

// ?include_messages=1 でチャットログ・シーン画像も同梱する(既定は状態のみ)。
playthroughsRouter.get('/:id/export-bundle', async (req, res) => {
  try {
    const includeMessages = req.query.include_messages === '1' || req.query.include_messages === 'true';
    const zipBuffer = await exportPlaythroughBundle(req.params.id, { includeMessages });
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="playthrough-${req.params.id}.zip"`);
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: 'export_failed', message: err.message });
  }
});

playthroughsRouter.get('/', (req, res) => {
  if (!req.query.world_id) return res.status(400).json({ error: 'world_id_required' });
  res.json(listPlaythroughsForWorld(req.query.world_id));
});

playthroughsRouter.post('/', (req, res) => {
  if (!req.body.world_id || !req.body.name) return res.status(400).json({ error: 'world_id_and_name_required' });
  res.status(201).json(createPlaythrough(req.body.world_id, req.body.name));
});

playthroughsRouter.get('/:id', (req, res) => {
  const playthrough = getPlaythrough(req.params.id);
  if (!playthrough) return res.status(404).json({ error: 'not_found' });
  res.json(playthrough);
});

playthroughsRouter.delete('/:id', (req, res) => {
  res.json(deletePlaythrough(req.params.id));
});

playthroughsRouter.put('/:id/protagonist', (req, res) => {
  res.json(updateProtagonistSettings(req.params.id, req.body));
});

playthroughsRouter.get('/:id/active-session', (req, res) => {
  res.json(getActiveSessionForPlaythrough(req.params.id) ?? null);
});

playthroughsRouter.post('/:id/room-sessions', (req, res) => {
  if (!req.body.room_template_id) return res.status(400).json({ error: 'room_template_id_required' });
  const playthrough = getPlaythrough(req.params.id);
  if (!playthrough) return res.status(404).json({ error: 'not_found' });
  // Rooms are shared master data now (0030_room_world_decoupling.sql) —
  // previously unguarded server-side, only prevented by client-side filtering.
  if (!isRoomInWorld(playthrough.world_id, req.body.room_template_id)) {
    return res.status(400).json({ error: 'room_not_in_world' });
  }
  // An already-active session wins, whatever room was asked for. Nothing used
  // to stop a second one being created — a browser-back into the room picker,
  // or a double-tap on a room card, left two active sessions behind, and
  // resuming the route then landed on the wrong one. Returning the existing
  // session instead of creating another keeps that from happening no matter
  // which path got here, and never discards a session in progress: leaving a
  // room deliberately still goes through 現在のシーンを閉じる or a move.
  const activeSession = getActiveSessionForPlaythrough(req.params.id);
  if (activeSession) return res.status(200).json(activeSession);
  const session = createRoomSession(req.params.id, req.body.room_template_id);
  res.status(201).json(session);
  // 部屋登場をブロックしないよう、応答送出後にモブのペルソナLLM生成を
  // fire-and-forgetでキックする(llmモードのWorldのみ、対象がいれば)。
  triggerPendingMobFlavorGeneration(session, getWorld(playthrough.world_id));
});

playthroughsRouter.get('/:id/room-sessions', (req, res) => {
  res.json(listSessionsForPlaythrough(req.params.id));
});

// Player-held inventory by default (owner_character_id null). Pass
// ?owner_character_id= to browse a specific NPC's held items instead (実装順6
// の「着る」パネルが、渡した衣装アイテムがその相手の手元にあるか確認するため使う）。
playthroughsRouter.get('/:id/inventory', (req, res) => {
  const ownerCharacterId = req.query.owner_character_id ? Number(req.query.owner_character_id) : null;
  res.json(listInventoryForPlaythrough(req.params.id, ownerCharacterId));
});

playthroughsRouter.post('/:id/inventory', (req, res) => {
  if (!req.body.item_id) return res.status(400).json({ error: 'item_id_required' });
  res.status(201).json(addItemToInventory(req.params.id, req.body.item_id, req.body.quantity ?? 1));
});

playthroughsRouter.post('/:id/inventory/use', (req, res) => {
  if (!req.body.item_id) return res.status(400).json({ error: 'item_id_required' });
  res.json(removeItemFromInventory(req.params.id, req.body.item_id, req.body.quantity ?? 1));
});

playthroughsRouter.post('/:id/inventory/transfer', (req, res) => {
  if (!req.body.item_id || !req.body.to_character_id) {
    return res.status(400).json({ error: 'item_id_and_to_character_id_required' });
  }
  res.json(transferItem(req.params.id, req.body.item_id, req.body.quantity ?? 1, req.body.to_character_id));
});

// 衣装マスタ専用の所持経済(0096)。itemsを介さないため別ルート群として並置。
playthroughsRouter.get('/:id/outfit-inventory', (req, res) => {
  const ownerCharacterId = req.query.owner_character_id ? Number(req.query.owner_character_id) : null;
  res.json(listOutfitInventoryForPlaythrough(req.params.id, ownerCharacterId));
});

playthroughsRouter.post('/:id/outfit-inventory', (req, res) => {
  if (!req.body.outfit_master_id) return res.status(400).json({ error: 'outfit_master_id_required' });
  res.status(201).json(addOutfitToInventory(req.params.id, req.body.outfit_master_id, req.body.quantity ?? 1));
});

playthroughsRouter.post('/:id/outfit-inventory/transfer', (req, res) => {
  if (!req.body.outfit_master_id || !req.body.to_character_id) {
    return res.status(400).json({ error: 'outfit_master_id_and_to_character_id_required' });
  }
  res.json(transferOutfitItem(req.params.id, req.body.outfit_master_id, req.body.quantity ?? 1, req.body.to_character_id));
});

// Route-scoped character memories (0068). Nested under the playthrough because
// that's what owns them — a character row itself is shared master data across
// Worlds and routes, so there's no meaningful character-level listing.
playthroughsRouter.get('/:id/memories', (req, res) => {
  res.json(listMemoriesForPlaythrough(req.params.id));
});

// 「戻る頃合い」になった子をキャラとして起こす。プレイヤーがボタンを押した
// ときだけ動く(materializeChild のコメント参照)。
playthroughsRouter.post('/:id/pregnancies/:pregnancyId/child', (req, res) => {
  const result = materializeChild(Number(req.params.pregnancyId));
  if (result.error) {
    const status = result.error === 'pregnancy_not_found' || result.error === 'mother_not_found' ? 404 : 400;
    return res.status(status).json(result);
  }
  res.status(201).json(result);
});

playthroughsRouter.post('/:id/memories', (req, res) => {
  if (!req.body.character_id || !req.body.content?.trim()) {
    return res.status(400).json({ error: 'character_id_and_content_required' });
  }
  const memory = addMemory({
    playthrough_id: Number(req.params.id),
    character_id: req.body.character_id,
    content: req.body.content,
    is_pinned: req.body.is_pinned,
    occurred_label: req.body.occurred_label ?? formatOccurredLabel(req.params.id),
    source: 'manual',
  });
  // null = mob character, which deliberately never keeps route-persistent state.
  if (!memory) return res.status(400).json({ error: 'mob_characters_cannot_have_memories' });
  res.status(201).json(memory);
});

playthroughsRouter.put('/:id/memories/:memoryId', (req, res) => {
  const memory = updateMemory(req.params.memoryId, req.body);
  if (!memory) return res.status(404).json({ error: 'not_found' });
  res.json(memory);
});

playthroughsRouter.delete('/:id/memories/:memoryId', (req, res) => {
  res.json(deleteMemory(req.params.memoryId));
});

// 開発デバッグ用の直接上書きエンドポイント(記憶パネルと同じ場所に並ぶ
// 「関係・印象」パネルから叩く)。書き込みは既存のイベントアクション
// (change_relationship/set_character_impression)と同じ経路
// (adjustValue/setImpressionValue)をそのまま使う——新しい書き込みロジックは無い。
playthroughsRouter.get('/:id/relationships', (req, res) => {
  res.json(listRelationshipValuesForPlaythrough(req.params.id));
});
playthroughsRouter.put('/:id/relationships', (req, res) => {
  const { character_id, relationship_axis_id, value } = req.body;
  if (!character_id || !relationship_axis_id || value == null) {
    return res.status(400).json({ error: 'character_id_axis_id_value_required' });
  }
  const current_value = adjustRelationshipValue(req.params.id, character_id, relationship_axis_id, 'set', Number(value));
  res.json({ character_id, relationship_axis_id, current_value });
});

playthroughsRouter.get('/:id/impressions', (req, res) => {
  res.json(listImpressionValuesForPlaythrough(req.params.id));
});
playthroughsRouter.put('/:id/impressions', (req, res) => {
  const { character_id, field_key, value } = req.body;
  if (!character_id || !field_key || value == null) return res.status(400).json({ error: 'character_id_field_key_value_required' });
  res.json(setImpressionValue(req.params.id, character_id, field_key, value));
});
