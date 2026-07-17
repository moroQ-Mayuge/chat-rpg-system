import { Router } from 'express';
import {
  listStatusesForWorld,
  listAllStatuses,
  getStatus,
  createStatus,
  updateStatus,
  deleteStatus,
  listWorldsForStatus,
  attachStatusToWorld,
  detachStatusFromWorld,
} from '../db/repositories/characterStatusesRepo.js';

export const characterStatusesRouter = Router();

characterStatusesRouter.get('/', (req, res) => {
  res.json(req.query.world_id ? listStatusesForWorld(req.query.world_id) : listAllStatuses());
});

characterStatusesRouter.post('/', (req, res) => {
  if (!req.body.name || !req.body.persistence_scope) return res.status(400).json({ error: 'name_and_persistence_scope_required' });
  res.status(201).json(createStatus(req.body));
});

characterStatusesRouter.put('/:id', (req, res) => {
  const existing = getStatus(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(updateStatus(req.params.id, req.body));
});

characterStatusesRouter.delete('/:id', (req, res) => {
  res.json(deleteStatus(req.params.id));
});

characterStatusesRouter.get('/:id/worlds', (req, res) => {
  res.json(listWorldsForStatus(req.params.id));
});

characterStatusesRouter.post('/:id/worlds', (req, res) => {
  res.json(attachStatusToWorld(req.body.world_id, req.params.id));
});

characterStatusesRouter.delete('/:id/worlds/:worldId', (req, res) => {
  res.json(detachStatusFromWorld(req.params.worldId, req.params.id));
});
