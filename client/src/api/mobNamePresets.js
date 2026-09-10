import { api } from './client.js';

export const mobNamePresetsApi = {
  listForWorld: (worldId) => api.get(`/mob-name-presets?world_id=${worldId}`),
  create: (data) => api.post('/mob-name-presets', data),
  update: (id, data) => api.put(`/mob-name-presets/${id}`, data),
  remove: (id) => api.del(`/mob-name-presets/${id}`),
};
