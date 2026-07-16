import { api } from './client.js';

export const worldsApi = {
  list: () => api.get('/worlds'),
  get: (id) => api.get(`/worlds/${id}`),
  create: (data) => api.post('/worlds', data),
  update: (id, data) => api.put(`/worlds/${id}`, data),
  remove: (id) => api.del(`/worlds/${id}`),
  uploadThumbnailImage: (id, file) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post(`/worlds/${id}/thumbnail-image`, formData);
  },
  generateThumbnailImage: (id, extraHint) => api.post(`/worlds/${id}/generate-thumbnail-image`, { extra_hint: extraHint }),
  listCalendarHolidays: (id) => api.get(`/worlds/${id}/calendar-holidays`),
  createCalendarHoliday: (id, data) => api.post(`/worlds/${id}/calendar-holidays`, data),
  updateCalendarHoliday: (id, holidayId, data) => api.put(`/worlds/${id}/calendar-holidays/${holidayId}`, data),
  removeCalendarHoliday: (id, holidayId) => api.del(`/worlds/${id}/calendar-holidays/${holidayId}`),
};
