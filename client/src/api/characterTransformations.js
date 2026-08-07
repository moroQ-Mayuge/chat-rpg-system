import { api } from './client.js';

export const characterTransformationsApi = {
  listAll: () => api.get('/character-transformations'),
  listForCharacter: (characterId) => api.get(`/characters/${characterId}/transformations`),
  create: (characterId, data) => api.post(`/characters/${characterId}/transformations`, data),
  update: (id, data) => api.put(`/character-transformations/${id}`, data),
  remove: (id) => api.del(`/character-transformations/${id}`),
};
