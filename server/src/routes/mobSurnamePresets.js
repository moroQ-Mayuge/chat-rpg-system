import { Router } from 'express';
import {
  listMobSurnamePresetsForWorld,
  createMobSurnamePreset,
  updateMobSurnamePreset,
  deleteMobSurnamePreset,
} from '../db/repositories/mobSurnamePresetsRepo.js';

export const mobSurnamePresetsRouter = Router();

mobSurnamePresetsRouter.get('/', (req, res) => {
  if (!req.query.world_id) return res.status(400).json({ error: 'world_id_required' });
  res.json(listMobSurnamePresetsForWorld(req.query.world_id));
});

mobSurnamePresetsRouter.post('/', (req, res) => {
  if (!req.body.world_id || !req.body.surname) return res.status(400).json({ error: 'world_id_and_surname_required' });
  res.status(201).json(createMobSurnamePreset(req.body));
});

mobSurnamePresetsRouter.put('/:id', (req, res) => {
  if (!req.body.surname) return res.status(400).json({ error: 'surname_required' });
  res.json(updateMobSurnamePreset(req.params.id, req.body));
});

mobSurnamePresetsRouter.delete('/:id', (req, res) => {
  res.json(deleteMobSurnamePreset(req.params.id));
});
