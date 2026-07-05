import { api } from './client.js';

export const propsApi = {
  list: () => api.get('/props'),
  create: (data) => api.post('/props', data),
  update: (id, data) => api.put(`/props/${id}`, data),
  remove: (id) => api.del(`/props/${id}`),
};
