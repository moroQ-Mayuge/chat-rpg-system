import { Router } from 'express';
import { listPoseMasters, createPoseMaster, updatePoseMaster, deletePoseMaster } from '../db/repositories/poseMastersRepo.js';

export const poseMastersRouter = Router();

poseMastersRouter.get('/', (req, res) => {
  res.json(listPoseMasters());
});

poseMastersRouter.post('/', (req, res) => {
  if (!req.body.name || !req.body.llm_tag_key) return res.status(400).json({ error: 'name_and_llm_tag_key_required' });
  res.status(201).json(createPoseMaster(req.body));
});

poseMastersRouter.put('/:id', (req, res) => {
  if (!req.body.name || !req.body.llm_tag_key) return res.status(400).json({ error: 'name_and_llm_tag_key_required' });
  res.json(updatePoseMaster(req.params.id, req.body));
});

poseMastersRouter.delete('/:id', (req, res) => {
  res.json(deletePoseMaster(req.params.id));
});
