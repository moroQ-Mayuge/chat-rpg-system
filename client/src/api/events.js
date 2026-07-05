import { api } from './client.js';

export const eventsApi = {
  list: () => api.get('/event-definitions'),
  get: (id) => api.get(`/event-definitions/${id}`),
  create: (data) => api.post('/event-definitions', data),
  update: (id, data) => api.put(`/event-definitions/${id}`, data),
  remove: (id) => api.del(`/event-definitions/${id}`),
  listOverrides: (roomTemplateId) => api.get(`/room-templates/${roomTemplateId}/event-overrides`),
  setOverride: (roomTemplateId, eventDefinitionId, overrideProbability) =>
    api.put(`/room-templates/${roomTemplateId}/event-overrides/${eventDefinitionId}`, { override_probability: overrideProbability }),
  removeOverride: (roomTemplateId, eventDefinitionId) =>
    api.del(`/room-templates/${roomTemplateId}/event-overrides/${eventDefinitionId}`),
};
