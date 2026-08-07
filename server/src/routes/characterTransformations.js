import { Router } from 'express';
import {
  listAll,
  listForCharacter,
  getTransformation,
  createTransformation,
  updateTransformation,
  deleteTransformation,
} from '../db/repositories/characterTransformationsRepo.js';

export const characterTransformationsRouter = Router();

characterTransformationsRouter.get('/character-transformations', (req, res) => {
  res.json(listAll());
});

characterTransformationsRouter.get('/characters/:characterId/transformations', (req, res) => {
  res.json(listForCharacter(req.params.characterId));
});

characterTransformationsRouter.post('/characters/:characterId/transformations', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createTransformation(req.params.characterId, req.body));
});

characterTransformationsRouter.put('/character-transformations/:id', (req, res) => {
  const existing = getTransformation(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(updateTransformation(req.params.id, req.body));
});

characterTransformationsRouter.delete('/character-transformations/:id', (req, res) => {
  res.json(deleteTransformation(req.params.id));
});
