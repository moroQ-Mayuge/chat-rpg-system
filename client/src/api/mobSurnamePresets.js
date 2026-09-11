import { api } from './client.js';

export const mobSurnamePresetsApi = {
  listForWorld: (worldId) => api.get(`/mob-surname-presets?world_id=${worldId}`),
  create: (data) => api.post('/mob-surname-presets', data),
  update: (id, data) => api.put(`/mob-surname-presets/${id}`, data),
  remove: (id) => api.del(`/mob-surname-presets/${id}`),
};
