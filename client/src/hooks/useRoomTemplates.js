import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { roomTemplatesApi } from '../api/roomTemplates.js';

export function useRoomTemplates(worldId) {
  return useQuery({ queryKey: ['roomTemplates', 'list', worldId ?? 'all'], queryFn: () => roomTemplatesApi.list(worldId) });
}

export function useRoomTemplate(id) {
  return useQuery({
    queryKey: ['roomTemplates', id],
    queryFn: () => roomTemplatesApi.get(id),
    enabled: id != null,
  });
}

export function useRoomTemplateMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['roomTemplates'] });
  return {
    create: useMutation({ mutationFn: roomTemplatesApi.create, onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, data }) => roomTemplatesApi.update(id, data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: roomTemplatesApi.remove, onSuccess: invalidate }),
    uploadBackgroundImage: useMutation({
      mutationFn: ({ id, file }) => roomTemplatesApi.uploadBackgroundImage(id, file),
      onSuccess: invalidate,
    }),
    generateBackgroundImage: useMutation({
      mutationFn: ({ id, mode, extraHint, worldId }) => roomTemplatesApi.generateBackgroundImage(id, mode, extraHint, worldId),
      onSuccess: invalidate,
    }),
  };
}

// Which Worlds a room master is attached to, and attaching/detaching it.
export function useRoomWorlds(roomTemplateId) {
  return useQuery({
    queryKey: ['roomTemplates', roomTemplateId, 'worlds'],
    queryFn: () => roomTemplatesApi.listWorlds(roomTemplateId),
    enabled: roomTemplateId != null,
  });
}

export function useRoomWorldMutations(roomTemplateId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['roomTemplates', roomTemplateId, 'worlds'] });
  return {
    attach: useMutation({ mutationFn: (worldId) => roomTemplatesApi.attachWorld(roomTemplateId, worldId), onSuccess: invalidate }),
    detach: useMutation({ mutationFn: (worldId) => roomTemplatesApi.detachWorld(roomTemplateId, worldId), onSuccess: invalidate }),
  };
}

// The per-World room-instance config: slot assignments, props, free props,
// and outgoing connections, all scoped to (room, world).
export function useRoomWorldConfig(roomTemplateId, worldId) {
  return useQuery({
    queryKey: ['roomTemplates', roomTemplateId, 'worlds', worldId, 'config'],
    queryFn: () => roomTemplatesApi.getWorldConfig(roomTemplateId, worldId),
    enabled: roomTemplateId != null && worldId != null,
  });
}

export function useRoomWorldConfigMutations(roomTemplateId, worldId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['roomTemplates', roomTemplateId, 'worlds', worldId, 'config'] });
  return {
    save: useMutation({ mutationFn: (data) => roomTemplatesApi.saveWorldConfig(roomTemplateId, worldId, data), onSuccess: invalidate }),
  };
}

export function useRoomConnections(roomTemplateId, worldId) {
  return useQuery({
    queryKey: ['roomTemplates', roomTemplateId, 'connections', worldId],
    queryFn: () => roomTemplatesApi.listConnections(roomTemplateId, worldId),
    enabled: roomTemplateId != null && worldId != null,
  });
}

export function useRoomConnectionMutations(roomTemplateId, worldId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['roomTemplates', roomTemplateId, 'connections', worldId] });
  return {
    create: useMutation({ mutationFn: (data) => roomTemplatesApi.createConnection(roomTemplateId, { ...data, world_id: worldId }), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ connectionId, data }) => roomTemplatesApi.updateConnection(connectionId, data),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: (connectionId) => roomTemplatesApi.removeConnection(connectionId), onSuccess: invalidate }),
  };
}
