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
};
