import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import type { AppRole, AppUserProfile } from '../data/types';
import { canAccessOperativo, canEditFinances, canViewFinances, isAdminRole } from '../utils/roles';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  is_active: boolean;
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
  /** Retorna mensaje de error o null si OK. */
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
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

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, name, role, is_active')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return {
    id: data.id as string,
    email: data.email as string,
    name: (data.name as string) || (data.email as string),
    role: normalizeRole(data.role as string),
    is_active: (data.is_active as boolean) ?? true,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applySession = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }
    const p = await fetchProfile(session.user.id);
    setProfile(p);
    setIsLoading(false);
  }, []);

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
      return { id: profile.id, name: profile.name || profile.email, role: effectiveRole };
    }
    return FALLBACK_USER;
  }, [profile, effectiveRole]);

  const value = useMemo<AuthContextValue>(() => ({
    profile,
    user,
    role: effectiveRole,
    isAuthenticated: !!profile && profile.is_active,
    isLoading,
    isAdmin: isAdminRole(effectiveRole),
    canViewFinances: canViewFinances(effectiveRole),
    canEditFinances: canEditFinances(effectiveRole),
    canAccessOperativo: canAccessOperativo(effectiveRole),
    login,
    logout,
    setRole: (r) => setDevRole(r),
  }), [profile, user, effectiveRole, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
