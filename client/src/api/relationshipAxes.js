import { api } from './client.js';

export const relationshipAxesApi = {
  list: () => api.get('/relationship-axes'),
  create: (data) => api.post('/relationship-axes', data),
  update: (id, data) => api.put(`/relationship-axes/${id}`, data),
  remove: (id) => api.del(`/relationship-axes/${id}`),
};
