import { api } from './client.js';

export const itemsApi = {
  listForWorld: (worldId) => api.get(`/items?world_id=${worldId}`),
  listAll: () => api.get('/items'),
  create: (data) => api.post('/items', data),
  update: (id, data) => api.put(`/items/${id}`, data),
  remove: (id) => api.del(`/items/${id}`),
};
