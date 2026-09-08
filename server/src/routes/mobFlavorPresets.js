import { Router } from 'express';
import {
  listMobFlavorPresetsForWorld,
  createMobFlavorPreset,
  updateMobFlavorPreset,
  deleteMobFlavorPreset,
} from '../db/repositories/mobFlavorPresetsRepo.js';

export const mobFlavorPresetsRouter = Router();

mobFlavorPresetsRouter.get('/', (req, res) => {
  if (!req.query.world_id) return res.status(400).json({ error: 'world_id_required' });
  res.json(listMobFlavorPresetsForWorld(req.query.world_id));
});

mobFlavorPresetsRouter.post('/', (req, res) => {
  if (!req.body.world_id || !req.body.name) return res.status(400).json({ error: 'world_id_and_name_required' });
  res.status(201).json(createMobFlavorPreset(req.body));
});

mobFlavorPresetsRouter.put('/:id', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.json(updateMobFlavorPreset(req.params.id, req.body));
});

mobFlavorPresetsRouter.delete('/:id', (req, res) => {
  res.json(deleteMobFlavorPreset(req.params.id));
});
