import type { AppRole } from '../data/types';

export const PROFILE_ROLE_CHANGED_EVENT = 'la-moneda:profile-role-changed';

export type ProfileRoleChangedDetail = {
  userId: string;
  previousRole: AppRole;
  newRole: AppRole;
  source: 'realtime' | 'refresh' | 'visibility' | 'broadcast';
};

export function dispatchProfileRoleChanged(detail: ProfileRoleChangedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PROFILE_ROLE_CHANGED_EVENT, { detail }));
}

export const PROFILE_ROLE_BROADCAST_CHANNEL = 'la-moneda-profile-role';

export function broadcastProfileRoleChanged(userId: string): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const bc = new BroadcastChannel(PROFILE_ROLE_BROADCAST_CHANNEL);
    bc.postMessage({ type: 'role-changed', userId });
    bc.close();
  } catch {
    /* ignore */
  }
}
