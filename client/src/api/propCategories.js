import { api } from './client.js';

export const propCategoriesApi = {
  listForWorld: (worldId) => api.get(`/prop-categories?world_id=${worldId}`),
  listAll: () => api.get('/prop-categories'),
  create: (data) => api.post('/prop-categories', data),
  update: (id, data) => api.put(`/prop-categories/${id}`, data),
  remove: (id) => api.del(`/prop-categories/${id}`),
};
