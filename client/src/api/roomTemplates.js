import { api } from './client.js';

export const roomTemplatesApi = {
  list: (worldId) => api.get(worldId ? `/room-templates?world_id=${worldId}` : '/room-templates'),
  get: (id) => api.get(`/room-templates/${id}`),
  create: (data) => api.post('/room-templates', data),
  update: (id, data) => api.put(`/room-templates/${id}`, data),
  remove: (id) => api.del(`/room-templates/${id}`),
  uploadBackgroundImage: (id, file) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post(`/room-templates/${id}/background-image`, formData);
  },
  generateBackgroundImage: (id, mode, extraHint, worldId) =>
    api.post(`/room-templates/${id}/generate-background-image`, { mode, extra_hint: extraHint, world_id: worldId }),
  listWorlds: (id) => api.get(`/room-templates/${id}/worlds`),
  attachWorld: (id, worldId) => api.post(`/room-templates/${id}/worlds`, { world_id: worldId }),
  detachWorld: (id, worldId) => api.del(`/room-templates/${id}/worlds/${worldId}`),
  getWorldConfig: (id, worldId) => api.get(`/room-templates/${id}/worlds/${worldId}/config`),
  saveWorldConfig: (id, worldId, data) => api.put(`/room-templates/${id}/worlds/${worldId}/config`, data),
  listConnections: (id, worldId) => api.get(`/room-templates/${id}/connections?world_id=${worldId}`),
  createConnection: (id, data) => api.post(`/room-templates/${id}/connections`, data),
  updateConnection: (connectionId, data) => api.put(`/room-connections/${connectionId}`, data),
  removeConnection: (connectionId) => api.del(`/room-connections/${connectionId}`),
};
