-- Una fila por (vehicle_id, tipo): fecha de vencimiento más lejana (misma regla que el pivot en la app).
-- Ejecutar en el SQL Editor de Supabase o con la CLI.
-- Requiere tabla public.control_fechas existente.

create or replace function public.fetch_latest_control_fechas_by_vehicle(p_empresa_id uuid)
returns setof public.control_fechas
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (cf.vehicle_id, cf.tipo) cf.*
  from public.control_fechas cf
  where cf.empresa_id = p_empresa_id
  order by
    cf.vehicle_id nulls last,
    cf.tipo,
    cf.fecha_vencimiento desc nulls last,
    cf.id desc;
$$;

comment on function public.fetch_latest_control_fechas_by_vehicle(uuid) is
  'Para la app: último vencimiento por tipo y vehículo (evita cargar miles de filas).';

grant execute on function public.fetch_latest_control_fechas_by_vehicle(uuid) to anon;
grant execute on function public.fetch_latest_control_fechas_by_vehicle(uuid) to authenticated;
grant execute on function public.fetch_latest_control_fechas_by_vehicle(uuid) to service_role;
