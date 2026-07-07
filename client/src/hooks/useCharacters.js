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

export function useOutfitMutations(characterId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['characters', characterId] });
  return {
    create: useMutation({ mutationFn: (data) => outfitsApi.create(characterId, data), onSuccess: invalidate }),
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
      mutationFn: ({ id, extraHint }) => outfitsApi.generateStandingImage(id, extraHint),
      onSuccess: invalidate,
    }),
    generateExpressionImage: useMutation({
      mutationFn: ({ id, expressionTypeId, extraHint, mode }) => outfitsApi.generateExpressionImage(id, expressionTypeId, extraHint, mode),
      onSuccess: invalidate,
    }),
  };
}
