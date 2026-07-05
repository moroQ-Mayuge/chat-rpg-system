import { Router } from 'express';
import {
  listRelationshipAxes,
  createRelationshipAxis,
  updateRelationshipAxis,
  deleteRelationshipAxis,
} from '../db/repositories/relationshipAxesRepo.js';

export const relationshipAxesRouter = Router();

relationshipAxesRouter.get('/', (req, res) => {
  res.json(listRelationshipAxes());
});

relationshipAxesRouter.post('/', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createRelationshipAxis(req.body));
});

relationshipAxesRouter.put('/:id', (req, res) => {
  res.json(updateRelationshipAxis(req.params.id, req.body));
});

relationshipAxesRouter.delete('/:id', (req, res) => {
  res.json(deleteRelationshipAxis(req.params.id));
});
