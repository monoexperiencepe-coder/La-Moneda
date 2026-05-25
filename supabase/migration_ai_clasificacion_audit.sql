-- =============================================================================
-- Auditoría Centro de Clasificación IA (solo revisión humana, sin auto-aplicar)
-- =============================================================================

create table if not exists public.ai_clasificacion_reviews (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  gasto_id bigint,
  action text not null check (
    action in ('batch_analyze', 'marcar_revisado', 'ocultar', 'reanalizar')
  ),
  tipo_actual text,
  subtipo_actual text,
  tipo_sugerido text,
  subtipo_sugerido text,
  confianza numeric,
  razon text,
  user_role text,
  created_at timestamptz not null default now()
);

create index if not exists ai_clasificacion_reviews_empresa_created_idx
  on public.ai_clasificacion_reviews (empresa_id, created_at desc);

create index if not exists ai_clasificacion_reviews_gasto_idx
  on public.ai_clasificacion_reviews (gasto_id, created_at desc);

comment on table public.ai_clasificacion_reviews is
  'Auditoría de sugerencias IA de clasificación: qué sugirió, quién revisó, sin aplicar cambios a gastos.';

alter table public.ai_clasificacion_reviews enable row level security;
alter table public.ai_clasificacion_reviews force row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'ai_clasificacion_reviews'
  loop
    execute format('drop policy if exists %I on public.ai_clasificacion_reviews', pol.policyname);
  end loop;
end $$;

create policy "ai_clasificacion_reviews_insert_own_tenant"
  on public.ai_clasificacion_reviews
  for insert
  to authenticated
  with check (
    public.is_active_user()
    and user_id = auth.uid()
    and empresa_id = public.current_user_empresa_id()
  );

create policy "ai_clasificacion_reviews_select_admin_tenant"
  on public.ai_clasificacion_reviews
  for select
  to authenticated
  using (
    public.is_active_user()
    and empresa_id = public.current_user_empresa_id()
    and not public.is_restricted_operador_account()
    and lower(trim(public.current_user_role())) in ('admin', 'socio', 'contador')
  );

create policy "ai_clasificacion_reviews_select_own"
  on public.ai_clasificacion_reviews
  for select
  to authenticated
  using (
    public.is_active_user()
    and user_id = auth.uid()
    and empresa_id = public.current_user_empresa_id()
  );

grant select, insert on public.ai_clasificacion_reviews to authenticated;
