import { api } from './client.js';

export const outfitMastersApi = {
  listForWorld: (worldId) => api.get(`/outfit-masters?world_id=${worldId}`),
  listAll: () => api.get('/outfit-masters'),
  create: (data) => api.post('/outfit-masters', data),
  update: (id, data) => api.put(`/outfit-masters/${id}`, data),
  remove: (id) => api.del(`/outfit-masters/${id}`),
  listWorlds: (id) => api.get(`/outfit-masters/${id}/worlds`),
  attachWorld: (id, worldId) => api.post(`/outfit-masters/${id}/worlds`, { world_id: worldId }),
  detachWorld: (id, worldId) => api.del(`/outfit-masters/${id}/worlds/${worldId}`),
};
