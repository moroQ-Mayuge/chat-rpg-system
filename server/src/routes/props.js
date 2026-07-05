import { Router } from 'express';
import { listProps, getProp, createProp, updateProp, deleteProp } from '../db/repositories/propsRepo.js';

export const propsRouter = Router();

propsRouter.get('/', (req, res) => {
  res.json(listProps());
});

propsRouter.post('/', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createProp(req.body));
});

propsRouter.put('/:id', (req, res) => {
  const existing = getProp(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(updateProp(req.params.id, req.body));
});

propsRouter.delete('/:id', (req, res) => {
  res.json(deleteProp(req.params.id));
});
