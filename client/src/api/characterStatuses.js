import { api } from './client.js';

export const characterStatusesApi = {
  listForWorld: (worldId) => api.get(`/character-statuses?world_id=${worldId}`),
  listAll: () => api.get('/character-statuses'),
  create: (data) => api.post('/character-statuses', data),
  update: (id, data) => api.put(`/character-statuses/${id}`, data),
  remove: (id) => api.del(`/character-statuses/${id}`),
};
