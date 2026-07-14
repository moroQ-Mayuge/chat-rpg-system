import { Router } from 'express';
import {
  listExpressionTypes,
  createExpressionType,
  updateExpressionType,
  deleteExpressionType,
} from '../db/repositories/expressionTypesRepo.js';

export const expressionTypesRouter = Router();

expressionTypesRouter.get('/', (req, res) => {
  res.json(listExpressionTypes());
});

expressionTypesRouter.post('/', (req, res) => {
  if (!req.body.name || !req.body.llm_tag_key) return res.status(400).json({ error: 'name_and_llm_tag_key_required' });
  res.status(201).json(createExpressionType(req.body));
});

expressionTypesRouter.put('/:id', (req, res) => {
  if (!req.body.name || !req.body.llm_tag_key) return res.status(400).json({ error: 'name_and_llm_tag_key_required' });
  res.json(updateExpressionType(req.params.id, req.body));
});

expressionTypesRouter.delete('/:id', (req, res) => {
  res.json(deleteExpressionType(req.params.id));
});
