import { Router } from 'express';
import {
  listEventDefinitions,
  getEventDefinition,
  createEventDefinition,
  updateEventDefinition,
  deleteEventDefinition,
} from '../db/repositories/eventDefinitionsRepo.js';
import { listOverridesForTemplate, setOverride, deleteOverride } from '../db/repositories/roomTemplateEventsRepo.js';
import { exportEventDefinitionJson, importEventDefinitionJson } from '../services/eventPortability.js';
import { exportEventDefinitionsBundle } from '../services/contentBundle/index.js';

export const eventsRouter = Router();

eventsRouter.get('/event-definitions', (req, res) => {
  res.json(listEventDefinitions());
});

// Must be registered before '/:id' below -- "export-bundle" would otherwise
// be captured as an :id value and hit getEventDefinition('export-bundle').
eventsRouter.get('/event-definitions/export-bundle', async (req, res) => {
  const ids = (req.query.ids ?? '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n));
  if (ids.length === 0) return res.status(400).json({ error: 'ids_required' });
  try {
    const zipBuffer = await exportEventDefinitionsBundle(ids);
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="events-bundle-${ids.length}.zip"`);
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: 'export_failed', message: err.message });
  }
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

eventsRouter.get('/event-definitions/:id/export', (req, res) => {
  try {
    res.json(exportEventDefinitionJson(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

eventsRouter.post('/event-definitions/import', (req, res) => {
  try {
    res.status(201).json(importEventDefinitionJson(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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
