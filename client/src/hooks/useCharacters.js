import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { charactersApi } from '../api/characters.js';
import { outfitsApi } from '../api/outfits.js';

export function useCharacters() {
  return useQuery({ queryKey: ['characters'], queryFn: charactersApi.list });
}

export function useCharacter(id) {
  return useQuery({
    queryKey: ['characters', id],
    queryFn: () => charactersApi.get(id),
    enabled: id != null,
  });
}

export function useCharacterMutations() {
  const queryClient = useQueryClient();
  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ['characters'], exact: true });
  const invalidateOne = (id) => queryClient.invalidateQueries({ queryKey: ['characters', id] });
  return {
    create: useMutation({ mutationFn: charactersApi.create, onSuccess: invalidateList }),
    update: useMutation({
      mutationFn: ({ id, data }) => charactersApi.update(id, data),
      onSuccess: (_, { id }) => {
        invalidateList();
        invalidateOne(id);
      },
    }),
    remove: useMutation({ mutationFn: charactersApi.remove, onSuccess: invalidateList }),
  };
}

export function useCharacterWorlds(characterId) {
  return useQuery({
    queryKey: ['characters', characterId, 'worlds'],
    queryFn: () => charactersApi.listWorlds(characterId),
    enabled: characterId != null && characterId !== 'new',
  });
}

export function useCharacterWorldMutations(characterId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['characters', characterId, 'worlds'] });
  return {
    attach: useMutation({ mutationFn: (worldId) => charactersApi.attachWorld(characterId, worldId), onSuccess: invalidate }),
    detach: useMutation({ mutationFn: (worldId) => charactersApi.detachWorld(characterId, worldId), onSuccess: invalidate }),
  };
}

export function useOutfitMutations(characterId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['characters', characterId] });
  return {
    create: useMutation({ mutationFn: (data) => outfitsApi.create(characterId, data), onSuccess: invalidate }),
    createFromMaster: useMutation({ mutationFn: (data) => outfitsApi.createFromMaster(characterId, data), onSuccess: invalidate }),
    detachMaster: useMutation({ mutationFn: (id) => outfitsApi.detachMaster(id), onSuccess: invalidate }),
    promoteToMaster: useMutation({
      mutationFn: ({ id, data }) => outfitsApi.promoteToMaster(id, data),
      onSuccess: () => {
        invalidate();
        queryClient.invalidateQueries({ queryKey: ['outfitMasters'] });
      },
    }),
    update: useMutation({ mutationFn: ({ id, data }) => outfitsApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: outfitsApi.remove, onSuccess: invalidate }),
    uploadStandingImage: useMutation({
      mutationFn: ({ id, file }) => outfitsApi.uploadStandingImage(id, file),
      onSuccess: invalidate,
    }),
    uploadExpressionImage: useMutation({
      mutationFn: ({ id, expressionTypeId, file }) => outfitsApi.uploadExpressionImage(id, expressionTypeId, file),
      onSuccess: invalidate,
    }),
    generateStandingImage: useMutation({
      mutationFn: ({ id, extraHint, tags }) => outfitsApi.generateStandingImage(id, extraHint, tags),
      onSuccess: invalidate,
    }),
    generateExpressionImage: useMutation({
      mutationFn: ({ id, expressionTypeId, extraHint, mode, tags }) =>
        outfitsApi.generateExpressionImage(id, expressionTypeId, extraHint, mode, tags),
      onSuccess: invalidate,
    }),
  };
}
