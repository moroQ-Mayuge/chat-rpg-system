import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { poseMastersApi } from '../api/poseMasters.js';

export function usePoseMasters() {
  return useQuery({ queryKey: ['poseMasters'], queryFn: poseMastersApi.list });
}

export function usePoseMasterMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['poseMasters'] });
  return {
    create: useMutation({ mutationFn: poseMastersApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => poseMastersApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: poseMastersApi.remove, onSuccess: invalidate }),
  };
}
