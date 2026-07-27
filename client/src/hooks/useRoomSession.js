import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { roomSessionsApi } from '../api/roomSessions.js';

export function useRoomSession(id) {
  return useQuery({
    queryKey: ['roomSessions', id],
    queryFn: () => roomSessionsApi.get(id),
    enabled: id != null,
  });
}

// What's pickable in this room right now — scoped to the session, so it
// resets when the player re-enters the room (0071).
export function usePickupItems(sessionId) {
  return useQuery({
    queryKey: ['roomSessions', sessionId, 'pickup-items'],
    queryFn: () => roomSessionsApi.listPickupItems(sessionId),
    enabled: sessionId != null,
  });
}

export function usePickupItemMutation(sessionId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId) => roomSessionsApi.pickUpItem(sessionId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roomSessions', sessionId, 'pickup-items'] });
      queryClient.invalidateQueries({ queryKey: ['playthroughs'] });
    },
  });
}

export function useRoomSessionMutations(id) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['roomSessions', id] });
    // A message can trigger the room template's turn-count time-advance trigger,
    // which mutates the playthrough's calendar state, so keep its query fresh too.
    queryClient.invalidateQueries({ queryKey: ['playthroughs'] });
  };
  return {
    sendMessage: useMutation({ mutationFn: (content) => roomSessionsApi.sendMessage(id, content), onSuccess: invalidate }),
    exit: useMutation({ mutationFn: () => roomSessionsApi.exit(id), onSuccess: invalidate }),
    move: useMutation({ mutationFn: (connectionId) => roomSessionsApi.move(id, connectionId), onSuccess: invalidate }),
    setAccompanying: useMutation({
      mutationFn: ({ characterId, isAccompanying }) => roomSessionsApi.setAccompanying(id, characterId, isAccompanying),
      onSuccess: invalidate,
    }),
    sellItem: useMutation({ mutationFn: (itemId) => roomSessionsApi.sellItem(id, itemId), onSuccess: invalidate }),
  };
}
