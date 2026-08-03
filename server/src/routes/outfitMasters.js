import { Router } from 'express';
import {
  listMastersForWorld,
  listAllMasters,
  getMaster,
  createMaster,
  updateMaster,
  deleteMaster,
  listWorldsForMaster,
  attachMasterToWorld,
  detachMasterFromWorld,
} from '../db/repositories/outfitMastersRepo.js';

export const outfitMastersRouter = Router();

outfitMastersRouter.get('/', (req, res) => {
  res.json(req.query.world_id ? listMastersForWorld(req.query.world_id) : listAllMasters());
});

outfitMastersRouter.post('/', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createMaster(req.body));
});

outfitMastersRouter.put('/:id', (req, res) => {
  const existing = getMaster(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(updateMaster(req.params.id, req.body));
});

outfitMastersRouter.delete('/:id', (req, res) => {
  res.json(deleteMaster(req.params.id));
});

outfitMastersRouter.get('/:id/worlds', (req, res) => {
  res.json(listWorldsForMaster(req.params.id));
});

outfitMastersRouter.post('/:id/worlds', (req, res) => {
  res.json(attachMasterToWorld(req.body.world_id, req.params.id));
});

outfitMastersRouter.delete('/:id/worlds/:worldId', (req, res) => {
  res.json(detachMasterFromWorld(req.params.worldId, req.params.id));
});
