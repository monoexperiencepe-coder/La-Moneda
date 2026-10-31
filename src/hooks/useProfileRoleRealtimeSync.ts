import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { broadcastProfileRoleChanged, PROFILE_ROLE_BROADCAST_CHANNEL } from '../utils/roleChangeEvents';

type Options = {
  userId: string | null | undefined;
  enabled: boolean;
  onRefreshProfile: (source: 'realtime' | 'visibility' | 'broadcast') => Promise<void>;
};

/**
 * Realtime + foco + multi-pestaña: dispara re-fetch autorizado del perfil (no confía en payload como permiso).
 */
export function useProfileRoleRealtimeSync({ userId, enabled, onRefreshProfile }: Options): void {
  const refreshRef = useRef(onRefreshProfile);
  refreshRef.current = onRefreshProfile;

  useEffect(() => {
    if (!enabled || !userId) return;

    const channel = supabase
      .channel(`lm03-profile-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_profiles',
          filter: `id=eq.${userId}`,
        },
        () => {
          void refreshRef.current('realtime');
        },
      )
      .subscribe();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshRef.current('visibility');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(PROFILE_ROLE_BROADCAST_CHANNEL);
      bc.onmessage = (ev: MessageEvent<{ type?: string; userId?: string }>) => {
        if (ev.data?.type === 'role-changed' && ev.data.userId === userId) {
          void refreshRef.current('broadcast');
        }
      };
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      bc?.close();
      void supabase.removeChannel(channel);
    };
  }, [enabled, userId]);
}

export { broadcastProfileRoleChanged };
