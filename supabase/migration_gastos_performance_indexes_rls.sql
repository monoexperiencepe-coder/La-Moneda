-- =============================================================================
-- Performance: índices public.gastos + user_profiles + RPC summary + RLS helpers
-- =============================================================================
-- Objetivo: fetchGastosRecent y get_gastos_financial_summary < timeout PostgREST.
-- NO modifica datos. NO desactiva RLS. Idempotente.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Índices public.gastos (lecturas por tenant, recientes, tipo, KPI)
-- ---------------------------------------------------------------------------
create index if not exists gastos_empresa_id_idx
  on public.gastos (empresa_id);

create index if not exists gastos_empresa_id_fecha_id_desc_idx
  on public.gastos (empresa_id, fecha desc, id desc);

create index if not exists gastos_empresa_id_tipo_gasto_idx
  on public.gastos (empresa_id, tipo_gasto);

create index if not exists gastos_empresa_id_tipo_gasto_fecha_desc_idx
  on public.gastos (empresa_id, tipo_gasto, fecha desc, id desc);

create index if not exists gastos_empresa_id_created_at_desc_idx
  on public.gastos (empresa_id, created_at desc);

-- Covering para agregados KPI (index-only scan cuando el planner lo elige)
create index if not exists gastos_empresa_id_kpi_cover_idx
  on public.gastos (empresa_id)
  include (monto, tipo_gasto, vehicle_id);

-- ---------------------------------------------------------------------------
-- 2) Índices public.user_profiles (helpers RLS — auth.uid() = id ya es PK)
-- ---------------------------------------------------------------------------
create index if not exists user_profiles_empresa_id_idx
  on public.user_profiles (empresa_id);

create index if not exists user_profiles_email_lower_idx
  on public.user_profiles (lower(trim(email)));

create index if not exists user_profiles_role_idx
  on public.user_profiles (role);

create index if not exists user_profiles_active_id_idx
  on public.user_profiles (id)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- 3) RLS helpers — una sola lectura de perfil en can_read_gasto (hot path)
-- ---------------------------------------------------------------------------
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(p.role::text))
  from public.user_profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.current_user_empresa_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.empresa_id
  from public.user_profiles p
  where p.id = auth.uid()
    and coalesce(p.is_active, false) = true
  limit 1;
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select coalesce(p.is_active, false)
      from public.user_profiles p
      where p.id = auth.uid()
      limit 1
    ),
    false
  );
$$;

create or replace function public.is_restricted_operador_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select
        lower(trim(p.role::text)) = 'operador'
        or lower(trim(p.email)) = lower(trim(coalesce(
          nullif(current_setting('app.restricted_operador_email', true), ''),
          'operador@lamoneda.com'
        )))
      from public.user_profiles p
      where p.id = auth.uid()
      limit 1
    ),
    true
  );
$$;

comment on function public.is_restricted_operador_account() is
  'true si auth.uid() es operador (rol o email operador@). Sin perfil → true (restrictivo).';

-- Hot path SELECT gastos: 1 lookup de perfil en lugar de 3–4 funciones anidadas.
create or replace function public.can_read_gasto(p_tipo text, p_empresa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select
        coalesce(p.is_active, false)
        and p.empresa_id is not null
        and p_empresa_id = p.empresa_id
        and (
          not (
            lower(trim(p.role::text)) = 'operador'
            or lower(trim(p.email)) = lower(trim(coalesce(
              nullif(current_setting('app.restricted_operador_email', true), ''),
              'operador@lamoneda.com'
            )))
          )
          or public.gasto_tipo_operador_visible(p_tipo)
        )
      from public.user_profiles p
      where p.id = auth.uid()
      limit 1
    ),
    false
  );
$$;

comment on function public.can_read_gasto(text, uuid) is
  'SELECT gastos: perfil único; finanzas ven tenant; operador@ solo globales/pendiente.';

-- ---------------------------------------------------------------------------
-- 4) RPC summary — GROUP BY (1 pass), solo columnas necesarias, sin ORDER BY
-- ---------------------------------------------------------------------------
create or replace function public.get_gastos_financial_summary(p_empresa_id uuid)
returns table (
  total_gastos numeric,
  total_count bigint,
  total_operativo_vehiculo numeric,
  count_operativo_vehiculo bigint,
  total_operativo_flota_general numeric,
  count_operativo_flota_general bigint,
  total_administrativo_empresa numeric,
  count_administrativo_empresa bigint,
  total_financiero_prestamo numeric,
  count_financiero_prestamo bigint,
  total_planilla_laboral numeric,
  count_planilla_laboral bigint,
  total_inversion_compra numeric,
  count_inversion_compra bigint,
  total_representacion_interna numeric,
  count_representacion_interna bigint,
  total_gastos_globales numeric,
  count_gastos_globales bigint,
  total_pendiente_revision numeric,
  count_pendiente_revision bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select
      g.monto,
      public.gastos_canonical_tipo_gasto(g.tipo_gasto, g.vehicle_id is not null) as tipo_canon
    from public.gastos g
    where g.empresa_id = p_empresa_id
  ),
  by_tipo as (
    select
      s.tipo_canon,
      sum(s.monto)::numeric as total_monto,
      count(*)::bigint as row_count
    from scoped s
    group by s.tipo_canon
  )
  select
    coalesce(sum(bt.total_monto), 0)::numeric,
    coalesce(sum(bt.row_count), 0)::bigint,
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'operativo_vehiculo'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'operativo_vehiculo'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'operativo_flota_general'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'operativo_flota_general'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'administrativo_empresa'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'administrativo_empresa'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'financiero_prestamo'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'financiero_prestamo'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'planilla_laboral'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'planilla_laboral'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'inversion_compra'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'inversion_compra'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'representacion_interna'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'representacion_interna'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'gastos_globales'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'gastos_globales'), 0),
    coalesce(max(bt.total_monto) filter (where bt.tipo_canon = 'pendiente_revision'), 0),
    coalesce(max(bt.row_count) filter (where bt.tipo_canon = 'pendiente_revision'), 0)
  from by_tipo bt;
$$;

comment on function public.get_gastos_financial_summary(uuid) is
  'KPIs globales por categoría canónica; GROUP BY 1 pass; SECURITY INVOKER + RLS.';

-- ---------------------------------------------------------------------------
-- 5) Estadísticas para el planner
-- ---------------------------------------------------------------------------
analyze public.gastos;
analyze public.user_profiles;

commit;

-- Verificación rápida (post-commit)
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'gastos'
order by indexname;
