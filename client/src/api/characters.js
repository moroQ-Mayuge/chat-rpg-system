import { api } from './client.js';

export const charactersApi = {
  list: () => api.get('/characters'),
  get: (id) => api.get(`/characters/${id}`),
  create: (data) => api.post('/characters', data),
  update: (id, data) => api.put(`/characters/${id}`, data),
  remove: (id) => api.del(`/characters/${id}`),
  generate: (instruction) => api.post('/characters/generate', { instruction }),
  parse: (text) => api.post('/characters/parse', { text }),
  generateField: (field, instruction, currentFields) =>
    api.post('/characters/generate-field', { field, instruction, currentFields }),
  listWorlds: (id) => api.get(`/characters/${id}/worlds`),
  attachWorld: (id, worldId) => api.post(`/characters/${id}/worlds`, { world_id: worldId }),
  detachWorld: (id, worldId) => api.del(`/characters/${id}/worlds/${worldId}`),
};
