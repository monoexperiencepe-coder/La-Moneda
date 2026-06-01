import { EMPRESA_ID } from '../config/app';
import { isRealtimeDebugEnv } from './realtimeBootLog';

export type EmpresaRealtimeResolve = {
  id: string;
  source: 'profile' | 'vite_env' | 'none';
};

/** ID de tenant para filtros realtime: perfil autenticado primero, luego VITE_EMPRESA_ID. */
export function resolveEmpresaRealtimeId(profileEmpresaId?: string | null): string {
  return resolveEmpresaRealtimeIdDetailed(profileEmpresaId).id;
}

export function resolveEmpresaRealtimeIdDetailed(
  profileEmpresaId?: string | null,
): EmpresaRealtimeResolve {
  const fromProfile = (profileEmpresaId ?? '').trim();
  const fromEnv = EMPRESA_ID;

  if (fromProfile && fromEnv && fromProfile !== fromEnv && isRealtimeDebugEnv()) {
    const warning = {
      profileEmpresaId: fromProfile,
      viteEmpresaId: fromEnv,
      using: fromProfile,
      message: 'profile.empresa_id y VITE_EMPRESA_ID difieren; realtime usa profile',
    };
    try {
      console.table(warning);
    } catch {
      /* noop */
    }
    console.warn('[realtime:empresa-source-warning:json]', JSON.stringify(warning, null, 2));
    console.warn('[realtime:empresa-source-warning]', warning);
  }

  if (fromProfile) {
    return { id: fromProfile, source: 'profile' };
  }
  if (fromEnv) {
    return { id: fromEnv, source: 'vite_env' };
  }
  return { id: '', source: 'none' };
}
