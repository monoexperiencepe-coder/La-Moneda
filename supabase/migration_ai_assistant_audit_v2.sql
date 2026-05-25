-- =============================================================================
-- Auditoría asistente IA v2: rol, tools denegadas
-- =============================================================================

alter table public.ai_assistant_logs
  add column if not exists user_role text,
  add column if not exists denied_tools text[] not null default '{}';

comment on column public.ai_assistant_logs.user_role is 'Rol del usuario al momento de la consulta.';
comment on column public.ai_assistant_logs.denied_tools is 'Herramientas solicitadas o bloqueadas por permisos.';
