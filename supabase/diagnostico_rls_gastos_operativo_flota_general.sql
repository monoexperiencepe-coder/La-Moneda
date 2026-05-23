-- =============================================================================
-- Diagnóstico RLS — clasificación operador + operativo_flota_general
-- READ-ONLY (prueba manual comentada al final)
-- =============================================================================

-- 1) Firmas can_update_gasto_check
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  case
    when pg_get_function_identity_arguments(p.oid) = 'p_tipo_gasto text, p_empresa_id uuid' then 'OK_NUEVA'
    when pg_get_function_identity_arguments(p.oid) = 'p_new_empresa_id uuid' then 'LEGACY_UUID'
    else 'OTRA'
  end as estado
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'can_update_gasto_check'
order by args;

-- 2) Policy UPDATE — WITH CHECK nueva firma
select
  policyname,
  cmd,
  with_check,
  case
    when with_check like '%can_update_gasto_check(tipo_gasto, empresa_id)%' then 'OK_WITH_CHECK_CLASIFICACION'
    when with_check like '%can_update_gasto_check(empresa_id)%' then 'LEGACY_UUID'
    else 'REVISAR'
  end as checklist
from pg_policies
where schemaname = 'public'
  and tablename = 'gastos'
  and policyname = 'gastos_update_tenant_role';

-- 3) Matriz lectura vs clasificación operador
select
  t.raw,
  public.gasto_tipo_gasto_permitido(t.raw) as destino_valido,
  public.gasto_tipo_operador_visible(t.raw) as operador_puede_leer
from (
  values
    ('gastos_globales'),
    ('pendiente_revision'),
    ('operativo_flota_general'),
    ('operativo_vehiculo'),
    ('inversion_compra'),
    ('administrativo_empresa')
) as t(raw)
order by t.raw;

select unnest(array[
  'ADMIN: mueve operativo_flota_general',
  'ADMIN: UPDATE gastos_globales → operativo_flota_general/frenos OK + SELECT fila',
  'OPERADOR: SELECT solo globales + pendiente_revision',
  'OPERADOR: UPDATE USING solo filas globales/pendiente',
  'OPERADOR: WITH CHECK permite destino operativo_flota_general (clasificación)',
  'OPERADOR: UPDATE globales → operativo_flota_general OK sin .select (app)',
  'OPERADOR: SELECT directo operativo_flota_general → 0 filas',
  'OPERADOR: no ve ingresos/resumen/reportes (UI + RLS otras tablas)'
]) as prueba_manual;

/*
-- ADMIN
const { data: g } = await window.supabase.from('gastos')
  .select('id').eq('tipo_gasto', 'gastos_globales').limit(1).maybeSingle();
await window.supabase.from('gastos').update({
  tipo_gasto: 'operativo_flota_general', subtipo_gasto: 'frenos',
  vehicle_id: null, es_global_flota: true,
}).eq('id', g.id).select('id, tipo_gasto, subtipo_gasto');

-- OPERADOR (sin .select — como hace la app)
const { data: g2 } = await window.supabase.from('gastos')
  .select('id').eq('tipo_gasto', 'gastos_globales').limit(1).maybeSingle();
await window.supabase.from('gastos').update({
  tipo_gasto: 'operativo_flota_general', subtipo_gasto: 'frenos',
  vehicle_id: null, es_global_flota: true,
}).eq('id', g2.id);
// OK; luego SELECT .eq('tipo_gasto','operativo_flota_general') → []
*/
