import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from 'react';
import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import type { Session } from '@supabase/supabase-js';
import type { AppRole, AppUserProfile } from '../data/types';
import { canAccessOperativo, canEditFinances, canViewFinances, isAdminRole } from '../utils/roles';
import {
  isFinancialOperadorRestricted,
  permissionUserFromAuth,
} from '../utils/permissions';
import { logRlsDebugContext } from '../services/rlsDebugService';
import { useProfileRoleRealtimeSync, broadcastProfileRoleChanged } from '../hooks/useProfileRoleRealtimeSync';
import { dispatchProfileRoleChanged } from '../utils/roleChangeEvents';
import { isRoleManagerUserId } from '../config/roleManagers';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  is_active: boolean;
  /** Tenant Supabase (RLS prep); alineado con empresas.id */
  empresa_id: string;
}

interface AuthContextValue {
  /** Perfil completo desde user_profiles (null si no autenticado o cargando). */
  profile: UserProfile | null;
  /** Adaptador AppUserProfile para compatibilidad con código existente. */
  user: AppUserProfile;
  role: AppRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  canViewFinances: boolean;
  canEditFinances: boolean;
  canAccessOperativo: boolean;
  /** Cuenta operador@… con acceso solo a gastos globales + pendiente revisión (restricción UI). */
  isFinancialOperador: boolean;
  /** LM-03: Diego SB / Álvaro SB24 — gestión de roles (≠ admin operativo). */
  canManageUserRoles: boolean;
  /** Retorna mensaje de error o null si OK. */
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  /** Re-fetch perfil desde Supabase (p. ej. tras cambio de rol remoto). */
  refreshProfile: () => Promise<void>;
  /** Incrementa cuando el perfil/rol efectivo cambia (invalidación UI). */
  profileRevision: number;
  /** Solo para dev/fallback — no usar en producción. */
  setRole: (role: AppRole) => void;
}

const ROLE_SET: AppRole[] = ['admin', 'socio', 'contador', 'operador'];

function normalizeRole(raw: string | undefined | null): AppRole {
  const r = (raw ?? '').toLowerCase() as AppRole;
  return ROLE_SET.includes(r) ? r : 'operador';
}

const FALLBACK_USER: AppUserProfile = { id: 'guest', name: 'Usuario', role: 'operador' };

const AuthContext = createContext<AuthContextValue | null>(null);

function profileFromRow(
  d: Record<string, unknown>,
  empresaId: string,
): UserProfile {
  return {
    id: d.id as string,
    email: d.email as string,
    name: (d.name as string) || (d.email as string),
    role: normalizeRole(d.role as string),
    is_active: (d.is_active as boolean) ?? true,
    empresa_id: empresaId,
  };
}

async function fetchProfileLegacy(userId: string): Promise<UserProfile | null> {
  const legacy = await supabase
    .from('user_profiles')
    .select('id, email, name, role, is_active')
    .eq('id', userId)
    .single();
  if (legacy.error || !legacy.data) return null;
  return profileFromRow(legacy.data as Record<string, unknown>, EMPRESA_ID || '');
}

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, name, role, is_active, empresa_id')
    .eq('id', userId)
    .single();
  if (error || !data) {
    // Tras prep RLS: columna nueva, caché PostgREST o esquema parcial — no bloquear login/permisos.
    if (error) return fetchProfileLegacy(userId);
    return null;
  }
  return profileFromRow(
    data as Record<string, unknown>,
    String(data.empresa_id ?? EMPRESA_ID ?? ''),
  );
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileRevision, setProfileRevision] = useState(0);
  const profileRef = useRef<UserProfile | null>(null);
  profileRef.current = profile;

  const applyProfileRow = useCallback(
    (
      p: UserProfile | null,
      meta?: { source?: 'realtime' | 'refresh' | 'visibility' | 'broadcast' | 'login' },
    ) => {
      const prev = profileRef.current;
      setProfile(p);
      setProfileRevision((n) => n + 1);
      if (p && prev && prev.id === p.id && prev.role !== p.role) {
        dispatchProfileRoleChanged({
          userId: p.id,
          previousRole: prev.role,
          newRole: p.role,
          source:
            meta?.source === 'login' || !meta?.source
              ? 'refresh'
              : meta.source,
        });
        broadcastProfileRoleChanged(p.id);
      }
    },
    [],
  );

  const applySession = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setProfile(null);
      setProfileRevision((n) => n + 1);
      setIsLoading(false);
      return;
    }
    const p = await fetchProfile(session.user.id);
    applyProfileRow(p, { source: 'login' });
    setIsLoading(false);
    if (import.meta.env.DEV && p) {
      void logRlsDebugContext('post-login').catch(() => undefined);
      console.info('[auth] perfil cargado', {
        authUserId: session.user.id,
        profileId: p.id,
        profileEmpresaId: p.empresa_id,
        profileRole: p.role,
        profileEmail: p.email,
        idsMatch: session.user.id === p.id,
      });
    }
  }, [applyProfileRow]);

  const refreshProfileFromServer = useCallback(
    async (source: 'realtime' | 'visibility' | 'broadcast' | 'refresh' = 'refresh') => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user) return;
      const p = await fetchProfile(session.user.id);
      if (!p) return;
      applyProfileRow(p, { source });
    },
    [applyProfileRow],
  );

  const refreshProfile = useCallback(async () => {
    await refreshProfileFromServer('refresh');
  }, [refreshProfileFromServer]);

  useProfileRoleRealtimeSync({
    userId: profile?.id ?? null,
    enabled: Boolean(profile?.id && profile.is_active),
    onRefreshProfile: refreshProfileFromServer,
  });

  useEffect(() => {
    // Retrieve existing session (fast – from local storage)
    supabase.auth.getSession().then(({ data }) => applySession(data.session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });
    return () => subscription.unsubscribe();
  }, [applySession]);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.includes('Invalid login')) return 'Email o contraseña incorrectos.';
      if (error.message.includes('Email not confirmed')) return 'Debes confirmar tu email antes de ingresar.';
      return error.message;
    }
    return null;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const role = profile?.role ?? 'operador';

  // dev fallback: allow overriding role locally when there's no real profile
  const [devRole, setDevRole] = useState<AppRole | null>(null);
  const effectiveRole: AppRole = profile ? role : (devRole ?? 'operador');

  const user = useMemo<AppUserProfile>(() => {
    if (profile) {
      return {
        id: profile.id,
        name: profile.name || profile.email,
        role: effectiveRole,
        email: profile.email,
        empresaId: profile.empresa_id || null,
      };
    }
    return FALLBACK_USER;
  }, [profile, effectiveRole]);

  const permissionUser = useMemo(
    () => permissionUserFromAuth(user, profile?.email ?? null),
    [user, profile?.email],
  );

  const financialOperador = isFinancialOperadorRestricted(permissionUser);
  const canManageUserRoles = isRoleManagerUserId(profile?.id ?? null);

  const value = useMemo<AuthContextValue>(() => ({
    profile,
    user,
    role: effectiveRole,
    isAuthenticated: !!profile && profile.is_active,
    isLoading,
    isAdmin: isAdminRole(effectiveRole),
    canViewFinances: financialOperador || canViewFinances(effectiveRole),
    canEditFinances: financialOperador || canEditFinances(effectiveRole),
    canAccessOperativo: financialOperador ? false : canAccessOperativo(effectiveRole),
    isFinancialOperador: financialOperador,
    canManageUserRoles,
    login,
    logout,
    refreshProfile,
    profileRevision,
    setRole: (r) => setDevRole(r),
  }), [profile, user, effectiveRole, isLoading, financialOperador, canManageUserRoles, login, logout, refreshProfile, profileRevision]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
