import { api } from './client.js';

export const worldsApi = {
  list: () => api.get('/worlds'),
  get: (id) => api.get(`/worlds/${id}`),
  create: (data) => api.post('/worlds', data),
  update: (id, data) => api.put(`/worlds/${id}`, data),
  remove: (id) => api.del(`/worlds/${id}`),
};
