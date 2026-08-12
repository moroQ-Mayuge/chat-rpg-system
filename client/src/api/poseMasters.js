import { api } from './client.js';

export const poseMastersApi = {
  list: () => api.get('/pose-masters'),
  create: (data) => api.post('/pose-masters', data),
  update: (id, data) => api.put(`/pose-masters/${id}`, data),
  remove: (id) => api.del(`/pose-masters/${id}`),
};
