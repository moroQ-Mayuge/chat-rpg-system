import { Router } from 'express';
import { listItemsForWorld, listAllItems, getItem, createItem, updateItem, deleteItem } from '../db/repositories/itemsRepo.js';

export const itemsRouter = Router();

// world_id query param returns the effective (common + that World's own)
// list; omitted returns every item across every World, for admin screens.
itemsRouter.get('/', (req, res) => {
  res.json(req.query.world_id ? listItemsForWorld(req.query.world_id) : listAllItems());
});

itemsRouter.post('/', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createItem(req.body));
});

itemsRouter.put('/:id', (req, res) => {
  const existing = getItem(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(updateItem(req.params.id, req.body));
});

itemsRouter.delete('/:id', (req, res) => {
  res.json(deleteItem(req.params.id));
});
