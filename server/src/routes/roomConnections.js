import { Router } from 'express';
import { getConnection, updateConnection, deleteConnection } from '../db/repositories/roomConnectionsRepo.js';

export const roomConnectionsRouter = Router();

roomConnectionsRouter.put('/:id', (req, res) => {
  const existing = getConnection(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(updateConnection(req.params.id, req.body));
});

roomConnectionsRouter.delete('/:id', (req, res) => {
  res.json(deleteConnection(req.params.id));
});
