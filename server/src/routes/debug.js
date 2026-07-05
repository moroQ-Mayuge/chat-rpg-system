import { Router } from 'express';
import { listWorlds } from '../db/repositories/worldsRepo.js';

export const debugRouter = Router();

debugRouter.get('/worlds', (req, res) => {
  res.json(listWorlds());
});
