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
};
