import { Router } from 'express';
import {
  listCharacters,
  getCharacter,
  createCharacter,
  updateCharacter,
  deleteCharacter,
} from '../db/repositories/charactersRepo.js';
import { generateCharacterSheet, parseAndSuggestTags, regenerateField } from '../services/characterAssist.js';
import { exportCharacterBundle } from '../services/contentBundle/index.js';
import { listWorldsForCharacter, attachCharacterToWorld, detachCharacterFromWorld } from '../db/repositories/worldCharactersRepo.js';

export const charactersRouter = Router();

charactersRouter.post('/generate', async (req, res) => {
  if (!req.body.instruction) return res.status(400).json({ error: 'instruction_required' });
  try {
    res.json(await generateCharacterSheet(req.body.instruction));
  } catch (err) {
    res.status(502).json({ error: 'generation_failed', message: err.message });
  }
});

charactersRouter.post('/parse', async (req, res) => {
  if (!req.body.text) return res.status(400).json({ error: 'text_required' });
  try {
    res.json(await parseAndSuggestTags(req.body.text));
  } catch (err) {
    res.status(502).json({ error: 'parse_failed', message: err.message });
  }
});

charactersRouter.post('/generate-field', async (req, res) => {
  const { field, instruction, currentFields } = req.body;
  if (!field) return res.status(400).json({ error: 'field_required' });
  try {
    const value = await regenerateField({ field, instruction, currentFields: currentFields ?? {} });
    res.json({ value });
  } catch (err) {
    res.status(502).json({ error: 'generation_failed', message: err.message });
  }
});

charactersRouter.get('/', (req, res) => {
  res.json(listCharacters());
});

charactersRouter.get('/:id', (req, res) => {
  const character = getCharacter(req.params.id);
  if (!character) return res.status(404).json({ error: 'not_found' });
  res.json(character);
});

charactersRouter.post('/', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createCharacter(req.body));
});

charactersRouter.put('/:id', (req, res) => {
  const existing = getCharacter(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  res.json(updateCharacter(req.params.id, req.body));
});

charactersRouter.delete('/:id', (req, res) => {
  res.json(deleteCharacter(req.params.id));
});

charactersRouter.get('/:id/worlds', (req, res) => {
  res.json(listWorldsForCharacter(req.params.id));
});

charactersRouter.post('/:id/worlds', (req, res) => {
  res.json(attachCharacterToWorld(req.body.world_id, req.params.id));
});

charactersRouter.delete('/:id/worlds/:worldId', (req, res) => {
  res.json(detachCharacterFromWorld(req.params.worldId, req.params.id));
});

charactersRouter.get('/:id/export-bundle', async (req, res) => {
  const character = getCharacter(req.params.id);
  if (!character) return res.status(404).json({ error: 'not_found' });
  try {
    const zipBuffer = await exportCharacterBundle(req.params.id);
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(character.name)}.zip"`);
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ error: 'export_failed', message: err.message });
  }
});
