import { EMPRESA_ID } from '../config/app';

/** ID de tenant para filtros realtime: perfil autenticado primero, luego .env legacy. */
export function resolveEmpresaRealtimeId(profileEmpresaId?: string | null): string {
  const fromProfile = (profileEmpresaId ?? '').trim();
  if (fromProfile) return fromProfile;
  return EMPRESA_ID;
}
