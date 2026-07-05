import { Router } from 'express';
import {
  listCharacters,
  getCharacter,
  createCharacter,
  updateCharacter,
  deleteCharacter,
} from '../db/repositories/charactersRepo.js';

export const charactersRouter = Router();

charactersRouter.get('/', (req, res) => {
  res.json(listCharacters());
});

charactersRouter.get('/:id', (req, res) => {
  const character = getCharacter(req.params.id);
  if (!character) return res.status(404).json({ error: 'not_found' });
  res.json(character);
});

charactersRouter.post('/', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createCharacter(req.body));
});

charactersRouter.put('/:id', (req, res) => {
  const existing = getCharacter(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(updateCharacter(req.params.id, req.body));
});

charactersRouter.delete('/:id', (req, res) => {
  res.json(deleteCharacter(req.params.id));
});
