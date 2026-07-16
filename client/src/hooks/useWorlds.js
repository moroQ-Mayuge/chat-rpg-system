import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { worldsApi } from '../api/worlds.js';

export function useWorlds() {
  return useQuery({ queryKey: ['worlds'], queryFn: worldsApi.list });
}

export function useWorldMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['worlds'] });
  return {
    create: useMutation({ mutationFn: worldsApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => worldsApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: worldsApi.remove, onSuccess: invalidate }),
    uploadThumbnailImage: useMutation({
      mutationFn: ({ id, file }) => worldsApi.uploadThumbnailImage(id, file),
      onSuccess: invalidate,
    }),
    generateThumbnailImage: useMutation({
      mutationFn: ({ id, extraHint }) => worldsApi.generateThumbnailImage(id, extraHint),
      onSuccess: invalidate,
    }),
  };
}

export function useCalendarHolidays(worldId) {
  return useQuery({
    queryKey: ['worlds', worldId, 'calendar-holidays'],
    queryFn: () => worldsApi.listCalendarHolidays(worldId),
    enabled: worldId != null && worldId !== 'new',
  });
}

export function useCalendarHolidayMutations(worldId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['worlds', worldId, 'calendar-holidays'] });
  return {
    create: useMutation({ mutationFn: (data) => worldsApi.createCalendarHoliday(worldId, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (holidayId) => worldsApi.removeCalendarHoliday(worldId, holidayId), onSuccess: invalidate }),
  };
}
