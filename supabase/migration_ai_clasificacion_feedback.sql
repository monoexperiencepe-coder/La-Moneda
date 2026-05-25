-- =============================================================================
-- Feedback humano sobre sugerencias IA (medición, sin reentrenar modelos)
-- =============================================================================

create table if not exists public.ai_clasificacion_feedback (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  gasto_id bigint not null,
  sugerencia_original_tipo text,
  sugerencia_original_subtipo text,
  resultado_final_tipo text,
  resultado_final_subtipo text,
  confianza_original numeric,
  fuente_original text,
  feedback_resultado text not null check (
    feedback_resultado in ('correcto', 'parcialmente_correcto', 'incorrecto', 'ignorado')
  ),
  correction_level text not null check (
    correction_level in ('none', 'subtipo_only', 'categoria_only', 'full_change')
  ),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_clasificacion_feedback_empresa_created_idx
  on public.ai_clasificacion_feedback (empresa_id, created_at desc);

create index if not exists ai_clasificacion_feedback_gasto_idx
  on public.ai_clasificacion_feedback (gasto_id, created_at desc);

create index if not exists ai_clasificacion_feedback_empresa_resultado_idx
  on public.ai_clasificacion_feedback (empresa_id, feedback_resultado);

comment on table public.ai_clasificacion_feedback is
  'Retroalimentación estructurada: qué sugirió la IA vs qué hizo el humano (sin entrenamiento de modelo).';

alter table public.ai_clasificacion_feedback enable row level security;
alter table public.ai_clasificacion_feedback force row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'ai_clasificacion_feedback'
  loop
    execute format('drop policy if exists %I on public.ai_clasificacion_feedback', pol.policyname);
  end loop;
end $$;

create policy "ai_clasificacion_feedback_select_tenant"
  on public.ai_clasificacion_feedback
  for select
  to authenticated
  using (
    public.is_active_user()
    and empresa_id = public.current_user_empresa_id()
  );

create policy "ai_clasificacion_feedback_insert_tenant"
  on public.ai_clasificacion_feedback
  for insert
  to authenticated
  with check (
    public.is_active_user()
    and empresa_id = public.current_user_empresa_id()
    and (created_by is null or created_by = auth.uid())
  );

grant select, insert on public.ai_clasificacion_feedback to authenticated;
