import { Router } from 'express';
import { listAllTriggers, createTrigger, deleteTrigger } from '../db/repositories/axisStatusTriggersRepo.js';

export const axisStatusTriggersRouter = Router();

axisStatusTriggersRouter.get('/', (req, res) => {
  res.json(listAllTriggers());
});

axisStatusTriggersRouter.post('/', (req, res) => {
  const { relationship_axis_id, comparison, threshold_value, status_id } = req.body;
  if (!relationship_axis_id || !comparison || threshold_value == null || !status_id) {
    return res.status(400).json({ error: 'relationship_axis_id_comparison_threshold_value_status_id_required' });
  }
  res.status(201).json(createTrigger(req.body));
});

axisStatusTriggersRouter.delete('/:id', (req, res) => {
  res.json(deleteTrigger(req.params.id));
});
