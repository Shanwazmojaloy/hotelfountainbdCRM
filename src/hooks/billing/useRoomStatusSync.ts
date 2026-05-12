'use client';
// =============================================================================
// useRoomStatusSync
// Subscribes to the rooms table via Supabase Realtime.
// When housekeeping marks a room CLEAN/DIRTY on any device, the front desk
// floor plan and room picker update instantly on all other screens.
//
// Call this once at the top of the dashboard layout — not per component.
// =============================================================================

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimePostgresUpdatePayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Room } from '@/types/billing';

export function useRoomStatusSync(tenantId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel('room-status-global')
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'rooms',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload: RealtimePostgresUpdatePayload<Room>) => {
          // Optimistic partial update — update the specific room in cache
          // before the full list refetch completes
          queryClient.setQueryData(
            ['room', payload.new.id],
            payload.new
          );
          // Also invalidate the full room list so the floor plan refreshes
          queryClient.invalidateQueries({ queryKey: ['rooms', tenantId] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId, queryClient]);
}

// ---------------------------------------------------------------------------
// useRoomList
// Fetches all rooms for a tenant. Used by the floor plan and room picker.
// Kept here alongside useRoomStatusSync so the query key matches.
// ---------------------------------------------------------------------------
export function useRoomList(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ['rooms', tenantId],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('room_number', { ascending: true });
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: Boolean(tenantId),
  });
}
