/** Identificador de empresa en Supabase (multi-tenant). */
export const EMPRESA_ID = (import.meta.env.VITE_EMPRESA_ID ?? '').trim();

/** Etiqueta guardada en `revisado_por` al aprobar o guardar clasificación manual. */
export const REVISION_USER_LABEL = (import.meta.env.VITE_REVISION_USER ?? '').trim() || 'app';

export const APP_USER_ROLE = ((import.meta.env.VITE_USER_ROLE ?? 'admin').trim().toLowerCase());
export const APP_USER_NAME = (import.meta.env.VITE_USER_NAME ?? 'Admin').trim() || 'Admin';
