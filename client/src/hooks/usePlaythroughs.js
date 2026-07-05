import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { playthroughsApi } from '../api/playthroughs.js';

export function usePlaythroughsForWorld(worldId) {
  return useQuery({
    queryKey: ['playthroughs', worldId],
    queryFn: () => playthroughsApi.listForWorld(worldId),
    enabled: worldId != null,
  });
}

export function useActiveSession(playthroughId) {
  return useQuery({
    queryKey: ['playthroughs', playthroughId, 'active-session'],
    queryFn: () => playthroughsApi.getActiveSession(playthroughId),
    enabled: playthroughId != null,
  });
}

export function usePlaythroughMutations(worldId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['playthroughs', worldId] });
  return {
    create: useMutation({ mutationFn: (name) => playthroughsApi.create(worldId, name), onSuccess: invalidate }),
    createRoomSession: useMutation({
      mutationFn: ({ playthroughId, roomTemplateId }) => playthroughsApi.createRoomSession(playthroughId, roomTemplateId),
    }),
  };
}
