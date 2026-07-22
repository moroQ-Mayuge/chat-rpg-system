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

export function useSessionsForPlaythrough(playthroughId) {
  return useQuery({
    queryKey: ['playthroughs', playthroughId, 'room-sessions'],
    queryFn: () => playthroughsApi.listSessions(playthroughId),
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
    updateProtagonist: useMutation({
      mutationFn: ({ id, data }) => playthroughsApi.updateProtagonist(id, data),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (id) => playthroughsApi.remove(id), onSuccess: invalidate }),
  };
}

export function useInventory(playthroughId) {
  return useQuery({
    queryKey: ['playthroughs', playthroughId, 'inventory'],
    queryFn: () => playthroughsApi.listInventory(playthroughId),
    enabled: playthroughId != null,
  });
}

export function useInventoryMutations(playthroughId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['playthroughs', playthroughId, 'inventory'] });
  return {
    addItem: useMutation({
      mutationFn: ({ itemId, quantity }) => playthroughsApi.addInventoryItem(playthroughId, itemId, quantity),
      onSuccess: invalidate,
    }),
    useItem: useMutation({
      mutationFn: ({ itemId, quantity }) => playthroughsApi.useInventoryItem(playthroughId, itemId, quantity),
      onSuccess: invalidate,
    }),
    transferItem: useMutation({
      mutationFn: ({ itemId, quantity, toCharacterId }) =>
        playthroughsApi.transferInventoryItem(playthroughId, itemId, quantity, toCharacterId),
      onSuccess: invalidate,
    }),
  };
}
