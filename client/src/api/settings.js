import { api } from './client.js';

export const settingsApi = {
  status: () => api.get('/settings/status'),
  listStylePresets: () => api.get('/settings/style-presets'),
  createStylePreset: (data) => api.post('/settings/style-presets', data),
  updateStylePreset: (id, data) => api.put(`/settings/style-presets/${id}`, data),
  removeStylePreset: (id) => api.del(`/settings/style-presets/${id}`),
  listImageFormats: () => api.get('/settings/image-formats'),
  setImageFormat: (kind, format) => api.put(`/settings/image-formats/${kind}`, { format }),
  testGenerateImage: (data) => api.post('/settings/test-generate-image', data),
};
