import { Router } from 'express';
import { getRoomSession, exitRoomSession } from '../db/repositories/roomSessionsRepo.js';
import { listMessagesForSession, createMessage } from '../db/repositories/messagesRepo.js';

export const roomSessionsRouter = Router();

roomSessionsRouter.get('/:id', (req, res) => {
  const session = getRoomSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'not_found' });
  res.json({ ...session, messages: listMessagesForSession(req.params.id) });
});

roomSessionsRouter.get('/:id/messages', (req, res) => {
  res.json(listMessagesForSession(req.params.id));
});

roomSessionsRouter.post('/:id/messages', (req, res) => {
  if (!req.body.content) return res.status(400).json({ error: 'content_required' });
  const message = createMessage(req.params.id, { sender_type: 'user', content: req.body.content });
  res.status(201).json(message);
});

roomSessionsRouter.post('/:id/exit', (req, res) => {
  res.json(exitRoomSession(req.params.id));
});
