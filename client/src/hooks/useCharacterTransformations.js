import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { characterTransformationsApi } from '../api/characterTransformations.js';

export function useAllCharacterTransformations() {
  return useQuery({ queryKey: ['characterTransformations', 'all'], queryFn: characterTransformationsApi.listAll });
}

export function useCharacterTransformationsForCharacter(characterId) {
  return useQuery({
    queryKey: ['characterTransformations', characterId],
    queryFn: () => characterTransformationsApi.listForCharacter(characterId),
    enabled: characterId != null && characterId !== 'new',
  });
}

export function useCharacterTransformationMutations(characterId) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['characterTransformations'] });
  };
  return {
    create: useMutation({ mutationFn: (data) => characterTransformationsApi.create(characterId, data), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, data }) => characterTransformationsApi.update(id, data),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: characterTransformationsApi.remove, onSuccess: invalidate }),
  };
}
