import { Router } from 'express';
import { listWorlds, getWorld, createWorld, updateWorld, deleteWorld } from '../db/repositories/worldsRepo.js';

export const worldsRouter = Router();

worldsRouter.get('/', (req, res) => {
  res.json(listWorlds());
});

worldsRouter.get('/:id', (req, res) => {
  const world = getWorld(req.params.id);
  if (!world) return res.status(404).json({ error: 'not_found' });
  res.json(world);
});

worldsRouter.post('/', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createWorld(req.body));
});

worldsRouter.put('/:id', (req, res) => {
  const existing = getWorld(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  if (existing.is_unassigned_bucket) return res.status(400).json({ error: 'unassigned_bucket_immutable' });
  res.json(updateWorld(req.params.id, req.body));
});

worldsRouter.delete('/:id', (req, res) => {
  const result = deleteWorld(req.params.id);
  if (!result.deleted) return res.status(400).json({ error: result.reason });
  res.json(result);
});
