-- =============================================================================
-- Memoria de clasificaciones humanas (contexto empresarial, sin embeddings)
-- =============================================================================

create table if not exists public.ai_clasificacion_memoria (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  texto_normalizado text not null,
  texto_original text not null,
  tipo_gasto_final text not null,
  subtipo_final text not null,
  vehicle_context text,
  confidence_humana numeric check (confidence_humana is null or (confidence_humana >= 0 and confidence_humana <= 1)),
  source text not null check (
    source in (
      'aplicacion_ia',
      'correccion_manual',
      'movimiento_manual',
      'operador',
      'admin'
    )
  ),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  veces_usado integer not null default 0 check (veces_usado >= 0),
  veces_confirmado integer not null default 0 check (veces_confirmado >= 0),
  veces_corregido integer not null default 0 check (veces_corregido >= 0)
);

create unique index if not exists ai_clasificacion_memoria_empresa_texto_uidx
  on public.ai_clasificacion_memoria (empresa_id, texto_normalizado);

create index if not exists ai_clasificacion_memoria_empresa_confirmado_idx
  on public.ai_clasificacion_memoria (empresa_id, veces_confirmado desc, updated_at desc);

comment on table public.ai_clasificacion_memoria is
  'Patrones texto → clasificación humana final por empresa (memoria contextual, no entrenamiento de modelo).';

alter table public.ai_clasificacion_memoria enable row level security;
alter table public.ai_clasificacion_memoria force row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'ai_clasificacion_memoria'
  loop
    execute format('drop policy if exists %I on public.ai_clasificacion_memoria', pol.policyname);
  end loop;
end $$;

create policy "ai_clasificacion_memoria_select_tenant"
  on public.ai_clasificacion_memoria
  for select
  to authenticated
  using (
    public.is_active_user()
    and empresa_id = public.current_user_empresa_id()
  );

create policy "ai_clasificacion_memoria_insert_tenant"
  on public.ai_clasificacion_memoria
  for insert
  to authenticated
  with check (
    public.is_active_user()
    and empresa_id = public.current_user_empresa_id()
    and (created_by is null or created_by = auth.uid())
  );

create policy "ai_clasificacion_memoria_update_tenant"
  on public.ai_clasificacion_memoria
  for update
  to authenticated
  using (
    public.is_active_user()
    and empresa_id = public.current_user_empresa_id()
  )
  with check (
    public.is_active_user()
    and empresa_id = public.current_user_empresa_id()
  );

grant select, insert, update on public.ai_clasificacion_memoria to authenticated;
