import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { outfitMastersApi } from '../api/outfitMasters.js';

export function useOutfitMastersForWorld(worldId) {
  return useQuery({
    queryKey: ['outfitMasters', worldId],
    queryFn: () => outfitMastersApi.listForWorld(worldId),
    enabled: worldId != null,
  });
}

export function useAllOutfitMasters() {
  return useQuery({ queryKey: ['outfitMasters', 'all'], queryFn: outfitMastersApi.listAll });
}

export function useOutfitMasterMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['outfitMasters'] });
  return {
    create: useMutation({ mutationFn: outfitMastersApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => outfitMastersApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: outfitMastersApi.remove, onSuccess: invalidate }),
  };
}

export function useOutfitMasterWorlds(masterId) {
  return useQuery({
    queryKey: ['outfitMasters', masterId, 'worlds'],
    queryFn: () => outfitMastersApi.listWorlds(masterId),
    enabled: masterId != null && masterId !== 'new',
  });
}

export function useOutfitMasterWorldMutations(masterId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['outfitMasters', masterId, 'worlds'] });
  return {
    attach: useMutation({ mutationFn: (worldId) => outfitMastersApi.attachWorld(masterId, worldId), onSuccess: invalidate }),
    detach: useMutation({ mutationFn: (worldId) => outfitMastersApi.detachWorld(masterId, worldId), onSuccess: invalidate }),
  };
}
