-- =============================================================================
-- Auditoría del asistente IA (fase 1 — solo lectura)
-- =============================================================================
-- Registra preguntas (preview), tools usadas, duración. Sin prompt completo.
-- Idempotente.
-- =============================================================================

create table if not exists public.ai_assistant_logs (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  question_preview text not null,
  tools_used text[] not null default '{}',
  duration_ms integer not null default 0 check (duration_ms >= 0),
  status text not null check (status in ('complete', 'error', 'denied')),
  created_at timestamptz not null default now()
);

create index if not exists ai_assistant_logs_empresa_created_idx
  on public.ai_assistant_logs (empresa_id, created_at desc);

create index if not exists ai_assistant_logs_user_created_idx
  on public.ai_assistant_logs (user_id, created_at desc);

comment on table public.ai_assistant_logs is
  'Auditoría del asistente IA: preview de pregunta, herramientas, duración (sin prompt completo).';

alter table public.ai_assistant_logs enable row level security;
alter table public.ai_assistant_logs force row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'ai_assistant_logs'
  loop
    execute format('drop policy if exists %I on public.ai_assistant_logs', pol.policyname);
  end loop;
end $$;

create policy "ai_assistant_logs_select_tenant_finanzas"
  on public.ai_assistant_logs
  for select
  to authenticated
  using (
    public.is_active_user()
    and empresa_id = public.current_user_empresa_id()
    and not public.is_restricted_operador_account()
    and lower(trim(public.current_user_role())) in ('admin', 'socio', 'contador')
  );

create policy "ai_assistant_logs_insert_own_tenant"
  on public.ai_assistant_logs
  for insert
  to authenticated
  with check (
    public.is_active_user()
    and user_id = auth.uid()
    and empresa_id = public.current_user_empresa_id()
  );

grant select, insert on public.ai_assistant_logs to authenticated;
