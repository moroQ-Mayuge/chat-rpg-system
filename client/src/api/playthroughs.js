import { api } from './client.js';

export const playthroughsApi = {
  listForWorld: (worldId) => api.get(`/playthroughs?world_id=${worldId}`),
  get: (id) => api.get(`/playthroughs/${id}`),
  create: (worldId, name) => api.post('/playthroughs', { world_id: worldId, name }),
  getActiveSession: (id) => api.get(`/playthroughs/${id}/active-session`),
  createRoomSession: (id, roomTemplateId) => api.post(`/playthroughs/${id}/room-sessions`, { room_template_id: roomTemplateId }),
  listSessions: (id) => api.get(`/playthroughs/${id}/room-sessions`),
  updateProtagonist: (id, data) => api.put(`/playthroughs/${id}/protagonist`, data),
  listInventory: (id) => api.get(`/playthroughs/${id}/inventory`),
  addInventoryItem: (id, itemId, quantity) => api.post(`/playthroughs/${id}/inventory`, { item_id: itemId, quantity }),
  useInventoryItem: (id, itemId, quantity) => api.post(`/playthroughs/${id}/inventory/use`, { item_id: itemId, quantity }),
  transferInventoryItem: (id, itemId, quantity, toCharacterId) =>
    api.post(`/playthroughs/${id}/inventory/transfer`, { item_id: itemId, quantity, to_character_id: toCharacterId }),
};
