import { api } from './client.js';

export const actionCommandsApi = {
  listForWorld: (worldId) => api.get(`/action-commands?world_id=${worldId}`),
  listAll: () => api.get('/action-commands'),
  create: (data) => api.post('/action-commands', data),
  update: (id, data) => api.put(`/action-commands/${id}`, data),
  remove: (id) => api.del(`/action-commands/${id}`),
};
