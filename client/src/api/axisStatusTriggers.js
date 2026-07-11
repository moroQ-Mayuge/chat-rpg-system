import { api } from './client.js';

export const axisStatusTriggersApi = {
  listAll: () => api.get('/axis-status-triggers'),
  create: (data) => api.post('/axis-status-triggers', data),
  remove: (id) => api.del(`/axis-status-triggers/${id}`),
};
