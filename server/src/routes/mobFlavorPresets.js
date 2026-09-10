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
  // 名前とは独立したペルソナ(性格・口調)プール(0129)。個々の項目はどれも任意
  // (空欄可)のため、必須なのはworld_idのみ。
  if (!req.body.world_id) return res.status(400).json({ error: 'world_id_required' });
  res.status(201).json(createMobFlavorPreset(req.body));
});

mobFlavorPresetsRouter.put('/:id', (req, res) => {
  res.json(updateMobFlavorPreset(req.params.id, req.body));
});

mobFlavorPresetsRouter.delete('/:id', (req, res) => {
  res.json(deleteMobFlavorPreset(req.params.id));
});
