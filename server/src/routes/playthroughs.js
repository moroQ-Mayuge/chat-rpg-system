import { Router } from 'express';
import {
  listPlaythroughsForWorld,
  getPlaythrough,
  createPlaythrough,
  updateProtagonistSettings,
} from '../db/repositories/playthroughsRepo.js';
import { getActiveSessionForPlaythrough, createRoomSession } from '../db/repositories/roomSessionsRepo.js';

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

playthroughsRouter.put('/:id/protagonist', (req, res) => {
  res.json(updateProtagonistSettings(req.params.id, req.body));
});

playthroughsRouter.get('/:id/active-session', (req, res) => {
  res.json(getActiveSessionForPlaythrough(req.params.id) ?? null);
});

playthroughsRouter.post('/:id/room-sessions', (req, res) => {
  if (!req.body.room_template_id) return res.status(400).json({ error: 'room_template_id_required' });
  res.status(201).json(createRoomSession(req.params.id, req.body.room_template_id));
});
