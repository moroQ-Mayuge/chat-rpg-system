import { Router } from 'express';
import {
  listEventDefinitions,
  getEventDefinition,
  createEventDefinition,
  updateEventDefinition,
  deleteEventDefinition,
} from '../db/repositories/eventDefinitionsRepo.js';
import { listOverridesForTemplate, setOverride, deleteOverride } from '../db/repositories/roomTemplateEventsRepo.js';

export const eventsRouter = Router();

eventsRouter.get('/event-definitions', (req, res) => {
  res.json(listEventDefinitions());
});

eventsRouter.get('/event-definitions/:id', (req, res) => {
  const def = getEventDefinition(req.params.id);
  if (!def) return res.status(404).json({ error: 'not_found' });
  res.json(def);
});

eventsRouter.post('/event-definitions', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createEventDefinition(req.body));
});

eventsRouter.put('/event-definitions/:id', (req, res) => {
  res.json(updateEventDefinition(req.params.id, req.body));
});

eventsRouter.delete('/event-definitions/:id', (req, res) => {
  res.json(deleteEventDefinition(req.params.id));
});

eventsRouter.get('/room-templates/:roomTemplateId/event-overrides', (req, res) => {
  res.json(listOverridesForTemplate(req.params.roomTemplateId));
});

eventsRouter.put('/room-templates/:roomTemplateId/event-overrides/:eventDefinitionId', (req, res) => {
  setOverride(req.params.roomTemplateId, req.params.eventDefinitionId, req.body.override_probability ?? null);
  res.json({ ok: true });
});

eventsRouter.delete('/room-templates/:roomTemplateId/event-overrides/:eventDefinitionId', (req, res) => {
  deleteOverride(req.params.roomTemplateId, req.params.eventDefinitionId);
  res.json({ ok: true });
});
