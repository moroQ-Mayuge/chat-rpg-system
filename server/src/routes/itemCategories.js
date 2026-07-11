import { Router } from 'express';
import {
  listCategoriesForWorld,
  listAllCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../db/repositories/itemCategoriesRepo.js';

export const itemCategoriesRouter = Router();

itemCategoriesRouter.get('/', (req, res) => {
  res.json(req.query.world_id ? listCategoriesForWorld(req.query.world_id) : listAllCategories());
});

itemCategoriesRouter.post('/', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createCategory(req.body));
});

itemCategoriesRouter.put('/:id', (req, res) => {
  const existing = getCategory(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(updateCategory(req.params.id, req.body));
});

itemCategoriesRouter.delete('/:id', (req, res) => {
  res.json(deleteCategory(req.params.id));
});
