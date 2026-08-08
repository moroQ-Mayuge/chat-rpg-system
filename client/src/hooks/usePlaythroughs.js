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

// ownerCharacterId省略(null)ならプレイヤー所持品、指定すればそのNPCの所持品
// (実装順6の「着る」パネルが対象NPCの手元を確認するために使う)。
export function useInventory(playthroughId, ownerCharacterId = null) {
  return useQuery({
    queryKey: ['playthroughs', playthroughId, 'inventory', ownerCharacterId],
    queryFn: () => playthroughsApi.listInventory(playthroughId, ownerCharacterId),
    enabled: playthroughId != null,
  });
}

export function useCharacterMemories(playthroughId, enabled = true) {
  return useQuery({
    queryKey: ['playthroughs', playthroughId, 'memories'],
    queryFn: () => playthroughsApi.listMemories(playthroughId),
    enabled: playthroughId != null && enabled,
  });
}

export function useCharacterMemoryMutations(playthroughId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['playthroughs', playthroughId, 'memories'] });
  return {
    add: useMutation({ mutationFn: (data) => playthroughsApi.addMemory(playthroughId, data), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ memoryId, data }) => playthroughsApi.updateMemory(playthroughId, memoryId, data),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (memoryId) => playthroughsApi.removeMemory(playthroughId, memoryId), onSuccess: invalidate }),
  };
}

export function useRelationshipValues(playthroughId, enabled = true) {
  return useQuery({
    queryKey: ['playthroughs', playthroughId, 'relationships'],
    queryFn: () => playthroughsApi.listRelationships(playthroughId),
    enabled: playthroughId != null && enabled,
  });
}

export function useRelationshipMutations(playthroughId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['playthroughs', playthroughId, 'relationships'] });
  return {
    update: useMutation({
      mutationFn: ({ characterId, axisId, value }) => playthroughsApi.updateRelationship(playthroughId, characterId, axisId, value),
      onSuccess: invalidate,
    }),
  };
}

export function useImpressionValues(playthroughId, enabled = true) {
  return useQuery({
    queryKey: ['playthroughs', playthroughId, 'impressions'],
    queryFn: () => playthroughsApi.listImpressions(playthroughId),
    enabled: playthroughId != null && enabled,
  });
}

export function useImpressionMutations(playthroughId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['playthroughs', playthroughId, 'impressions'] });
  return {
    update: useMutation({
      mutationFn: ({ characterId, fieldKey, value }) => playthroughsApi.updateImpression(playthroughId, characterId, fieldKey, value),
      onSuccess: invalidate,
    }),
  };
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
