import { Router } from 'express';
import {
  listActionCommandsForWorld,
  listAllActionCommands,
  getActionCommand,
  createActionCommand,
  updateActionCommand,
  deleteActionCommand,
} from '../db/repositories/actionCommandsRepo.js';

export const actionCommandsRouter = Router();

actionCommandsRouter.get('/', (req, res) => {
  res.json(req.query.world_id ? listActionCommandsForWorld(req.query.world_id) : listAllActionCommands());
});

actionCommandsRouter.post('/', (req, res) => {
  if (!req.body.label) return res.status(400).json({ error: 'label_required' });
  res.status(201).json(createActionCommand(req.body));
});

actionCommandsRouter.put('/:id', (req, res) => {
  const existing = getActionCommand(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(updateActionCommand(req.params.id, req.body));
});

actionCommandsRouter.delete('/:id', (req, res) => {
  res.json(deleteActionCommand(req.params.id));
});
