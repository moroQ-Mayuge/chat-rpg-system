import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { roomSessionsApi } from '../api/roomSessions.js';

// options.day: 'current'(当日分のみ、0122) | 数値(その日のログのみ) | 省略(全件)。
// クエリキーにdayを含めても、既存の['roomSessions', id]でのinvalidateは
// react-queryの前方一致マッチでそのまま効く。
export function useRoomSession(id, options = {}) {
  const { day } = options;
  return useQuery({
    queryKey: ['roomSessions', id, day ?? 'all'],
    queryFn: () => roomSessionsApi.get(id, { day }),
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

// 「買い物」コマンド(ShopPanel)向け。店でない部屋では空({items:[],outfits:[]})
// が返る(shop-productsルート側のガード、roomSessions.js参照)。
export function useShopProducts(sessionId) {
  return useQuery({
    queryKey: ['roomSessions', sessionId, 'shop-products'],
    queryFn: () => roomSessionsApi.getShopProducts(sessionId),
    enabled: sessionId != null,
  });
}

// 'pickup'部屋(衣裳部屋など)向け。pickup部屋でなければ空配列が返る。
export function usePickupableOutfits(sessionId) {
  return useQuery({
    queryKey: ['roomSessions', sessionId, 'pickupable-outfits'],
    queryFn: () => roomSessionsApi.listPickupableOutfits(sessionId),
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
    craftItem: useMutation({
      mutationFn: ({ content, craft }) => roomSessionsApi.craftItem(id, content, craft),
      onSuccess: invalidate,
    }),
    exit: useMutation({ mutationFn: () => roomSessionsApi.exit(id), onSuccess: invalidate }),
    move: useMutation({ mutationFn: (connectionId) => roomSessionsApi.move(id, connectionId), onSuccess: invalidate }),
    setAccompanying: useMutation({
      mutationFn: ({ characterId, isAccompanying }) => roomSessionsApi.setAccompanying(id, characterId, isAccompanying),
      onSuccess: invalidate,
    }),
    sellItem: useMutation({ mutationFn: (itemId) => roomSessionsApi.sellItem(id, itemId), onSuccess: invalidate }),
    buyItem: useMutation({ mutationFn: (itemId) => roomSessionsApi.buyItem(id, itemId), onSuccess: invalidate }),
    buyOutfit: useMutation({ mutationFn: (outfitMasterId) => roomSessionsApi.buyOutfit(id, outfitMasterId), onSuccess: invalidate }),
    pickupOutfit: useMutation({ mutationFn: (outfitMasterId) => roomSessionsApi.pickupOutfit(id, outfitMasterId), onSuccess: invalidate }),
    wearItem: useMutation({
      mutationFn: ({ characterId, itemId }) => roomSessionsApi.wearItem(id, characterId, itemId),
      onSuccess: invalidate,
    }),
    wearOutfit: useMutation({
      mutationFn: ({ characterId, outfitMasterId }) => roomSessionsApi.wearOutfit(id, characterId, outfitMasterId),
      onSuccess: invalidate,
    }),
    transformRequest: useMutation({
      mutationFn: ({ characterId, transformationId }) => roomSessionsApi.transformRequest(id, characterId, transformationId),
      onSuccess: invalidate,
    }),
  };
}
