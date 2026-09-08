import { api } from './client.js';

export const mobFlavorPresetsApi = {
  listForWorld: (worldId) => api.get(`/mob-flavor-presets?world_id=${worldId}`),
  create: (data) => api.post('/mob-flavor-presets', data),
  update: (id, data) => api.put(`/mob-flavor-presets/${id}`, data),
  remove: (id) => api.del(`/mob-flavor-presets/${id}`),
};
