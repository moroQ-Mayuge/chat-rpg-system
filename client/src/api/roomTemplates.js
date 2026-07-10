import { api } from './client.js';

export const roomTemplatesApi = {
  list: () => api.get('/room-templates'),
  get: (id) => api.get(`/room-templates/${id}`),
  create: (data) => api.post('/room-templates', data),
  update: (id, data) => api.put(`/room-templates/${id}`, data),
  remove: (id) => api.del(`/room-templates/${id}`),
  uploadBackgroundImage: (id, file) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post(`/room-templates/${id}/background-image`, formData);
  },
  generateBackgroundImage: (id, mode, extraHint) =>
    api.post(`/room-templates/${id}/generate-background-image`, { mode, extra_hint: extraHint }),
  listConnections: (id) => api.get(`/room-templates/${id}/connections`),
  createConnection: (id, data) => api.post(`/room-templates/${id}/connections`, data),
  updateConnection: (connectionId, data) => api.put(`/room-connections/${connectionId}`, data),
  removeConnection: (connectionId) => api.del(`/room-connections/${connectionId}`),
};
