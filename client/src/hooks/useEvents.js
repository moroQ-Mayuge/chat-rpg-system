import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eventsApi } from '../api/events.js';

export function useEventDefinitions() {
  return useQuery({ queryKey: ['eventDefinitions'], queryFn: eventsApi.list });
}

export function useEventDefinitionMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['eventDefinitions'] });
  return {
    create: useMutation({ mutationFn: eventsApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => eventsApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: eventsApi.remove, onSuccess: invalidate }),
  };
}

export function useEventOverrides(roomTemplateId) {
  return useQuery({
    queryKey: ['eventOverrides', roomTemplateId],
    queryFn: () => eventsApi.listOverrides(roomTemplateId),
    enabled: roomTemplateId != null,
  });
}

export function useEventOverrideMutations(roomTemplateId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['eventOverrides', roomTemplateId] });
  return {
    set: useMutation({
      mutationFn: ({ eventDefinitionId, overrideProbability }) =>
        eventsApi.setOverride(roomTemplateId, eventDefinitionId, overrideProbability),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (eventDefinitionId) => eventsApi.removeOverride(roomTemplateId, eventDefinitionId),
      onSuccess: invalidate,
    }),
  };
}
