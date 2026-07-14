import { Router } from 'express';
import {
  listCategoriesForWorld,
  listAllCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../db/repositories/propCategoriesRepo.js';

export const propCategoriesRouter = Router();

propCategoriesRouter.get('/', (req, res) => {
  res.json(req.query.world_id ? listCategoriesForWorld(req.query.world_id) : listAllCategories());
});

propCategoriesRouter.post('/', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createCategory(req.body));
});

propCategoriesRouter.put('/:id', (req, res) => {
  const existing = getCategory(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(updateCategory(req.params.id, req.body));
});

propCategoriesRouter.delete('/:id', (req, res) => {
  res.json(deleteCategory(req.params.id));
});
