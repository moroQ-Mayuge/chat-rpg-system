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
import { isRoomInWorld } from '../db/repositories/worldRoomTemplatesRepo.js';
import {
  listMemoriesForPlaythrough,
  addMemory,
  updateMemory,
  deleteMemory,
  formatOccurredLabel,
} from '../db/repositories/characterMemoriesRepo.js';

export const playthroughsRouter = Router();

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
  res.status(201).json(createRoomSession(req.params.id, req.body.room_template_id));
});

playthroughsRouter.get('/:id/room-sessions', (req, res) => {
  res.json(listSessionsForPlaythrough(req.params.id));
});

// Player-held inventory (owner_character_id null). NPC-held inventory is
// reachable via transferItem below but has no listing endpoint yet — no UI
// needs to browse an NPC's held items today, only move things into their
// hands.
playthroughsRouter.get('/:id/inventory', (req, res) => {
  res.json(listInventoryForPlaythrough(req.params.id));
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

// Route-scoped character memories (0068). Nested under the playthrough because
// that's what owns them — a character row itself is shared master data across
// Worlds and routes, so there's no meaningful character-level listing.
playthroughsRouter.get('/:id/memories', (req, res) => {
  res.json(listMemoriesForPlaythrough(req.params.id));
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
