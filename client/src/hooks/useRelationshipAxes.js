import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { relationshipAxesApi } from '../api/relationshipAxes.js';

export function useRelationshipAxes() {
  return useQuery({ queryKey: ['relationshipAxes'], queryFn: relationshipAxesApi.list });
}

export function useRelationshipAxisMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['relationshipAxes'] });
  return {
    create: useMutation({ mutationFn: relationshipAxesApi.create, onSuccess: invalidate }),
    remove: useMutation({ mutationFn: relationshipAxesApi.remove, onSuccess: invalidate }),
  };
}
