import { api } from './client.js';

export const itemCategoriesApi = {
  listForWorld: (worldId) => api.get(`/item-categories?world_id=${worldId}`),
  listAll: () => api.get('/item-categories'),
  create: (data) => api.post('/item-categories', data),
  update: (id, data) => api.put(`/item-categories/${id}`, data),
  remove: (id) => api.del(`/item-categories/${id}`),
};
