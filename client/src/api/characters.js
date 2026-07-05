import { api } from './client.js';

export const charactersApi = {
  list: () => api.get('/characters'),
  get: (id) => api.get(`/characters/${id}`),
  create: (data) => api.post('/characters', data),
  update: (id, data) => api.put(`/characters/${id}`, data),
  remove: (id) => api.del(`/characters/${id}`),
};
