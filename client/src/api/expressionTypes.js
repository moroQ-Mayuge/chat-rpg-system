import { api } from './client.js';

export const expressionTypesApi = {
  list: () => api.get('/expression-types'),
  create: (data) => api.post('/expression-types', data),
  update: (id, data) => api.put(`/expression-types/${id}`, data),
  remove: (id) => api.del(`/expression-types/${id}`),
};
