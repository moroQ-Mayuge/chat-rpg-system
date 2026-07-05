import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { expressionTypesApi } from '../api/expressionTypes.js';

export function useExpressionTypes() {
  return useQuery({ queryKey: ['expressionTypes'], queryFn: expressionTypesApi.list });
}

export function useExpressionTypeMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['expressionTypes'] });
  return {
    create: useMutation({ mutationFn: expressionTypesApi.create, onSuccess: invalidate }),
    remove: useMutation({ mutationFn: expressionTypesApi.remove, onSuccess: invalidate }),
  };
}
