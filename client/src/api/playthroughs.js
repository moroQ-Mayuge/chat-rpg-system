import { api } from './client.js';

export const playthroughsApi = {
  listForWorld: (worldId) => api.get(`/playthroughs?world_id=${worldId}`),
  get: (id) => api.get(`/playthroughs/${id}`),
  create: (worldId, name) => api.post('/playthroughs', { world_id: worldId, name }),
  remove: (id) => api.del(`/playthroughs/${id}`),
  getActiveSession: (id) => api.get(`/playthroughs/${id}/active-session`),
  createRoomSession: (id, roomTemplateId) => api.post(`/playthroughs/${id}/room-sessions`, { room_template_id: roomTemplateId }),
  listSessions: (id) => api.get(`/playthroughs/${id}/room-sessions`),
  updateProtagonist: (id, data) => api.put(`/playthroughs/${id}/protagonist`, data),
  listInventory: (id, ownerCharacterId) =>
    api.get(`/playthroughs/${id}/inventory${ownerCharacterId != null ? `?owner_character_id=${ownerCharacterId}` : ''}`),
  addInventoryItem: (id, itemId, quantity) => api.post(`/playthroughs/${id}/inventory`, { item_id: itemId, quantity }),
  useInventoryItem: (id, itemId, quantity) => api.post(`/playthroughs/${id}/inventory/use`, { item_id: itemId, quantity }),
  transferInventoryItem: (id, itemId, quantity, toCharacterId) =>
    api.post(`/playthroughs/${id}/inventory/transfer`, { item_id: itemId, quantity, to_character_id: toCharacterId }),
  listOutfitInventory: (id, ownerCharacterId) =>
    api.get(`/playthroughs/${id}/outfit-inventory${ownerCharacterId != null ? `?owner_character_id=${ownerCharacterId}` : ''}`),
  addOutfitInventoryItem: (id, outfitMasterId, quantity) =>
    api.post(`/playthroughs/${id}/outfit-inventory`, { outfit_master_id: outfitMasterId, quantity }),
  transferOutfitInventoryItem: (id, outfitMasterId, quantity, toCharacterId) =>
    api.post(`/playthroughs/${id}/outfit-inventory/transfer`, { outfit_master_id: outfitMasterId, quantity, to_character_id: toCharacterId }),
  listMemories: (id) => api.get(`/playthroughs/${id}/memories`),
  addMemory: (id, data) => api.post(`/playthroughs/${id}/memories`, data),
  updateMemory: (id, memoryId, data) => api.put(`/playthroughs/${id}/memories/${memoryId}`, data),
  removeMemory: (id, memoryId) => api.del(`/playthroughs/${id}/memories/${memoryId}`),
  listRelationships: (id) => api.get(`/playthroughs/${id}/relationships`),
  updateRelationship: (id, characterId, relationshipAxisId, value) =>
    api.put(`/playthroughs/${id}/relationships`, { character_id: characterId, relationship_axis_id: relationshipAxisId, value }),
  listImpressions: (id) => api.get(`/playthroughs/${id}/impressions`),
  updateImpression: (id, characterId, fieldKey, value) =>
    api.put(`/playthroughs/${id}/impressions`, { character_id: characterId, field_key: fieldKey, value }),
  materializeChild: (id, pregnancyId) => api.post(`/playthroughs/${id}/pregnancies/${pregnancyId}/child`, {}),
};
