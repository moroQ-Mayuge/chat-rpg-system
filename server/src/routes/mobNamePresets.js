import { Router } from 'express';
import {
  listMobNamePresetsForWorld,
  createMobNamePreset,
  updateMobNamePreset,
  deleteMobNamePreset,
} from '../db/repositories/mobNamePresetsRepo.js';

export const mobNamePresetsRouter = Router();

mobNamePresetsRouter.get('/', (req, res) => {
  if (!req.query.world_id) return res.status(400).json({ error: 'world_id_required' });
  res.json(listMobNamePresetsForWorld(req.query.world_id));
});

mobNamePresetsRouter.post('/', (req, res) => {
  if (!req.body.world_id || !req.body.name) return res.status(400).json({ error: 'world_id_and_name_required' });
  res.status(201).json(createMobNamePreset(req.body));
});

mobNamePresetsRouter.put('/:id', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.json(updateMobNamePreset(req.params.id, req.body));
});

mobNamePresetsRouter.delete('/:id', (req, res) => {
  res.json(deleteMobNamePreset(req.params.id));
});
