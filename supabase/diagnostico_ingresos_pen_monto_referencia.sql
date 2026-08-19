-- AUDITORÍA DE SOLO LECTURA. No modifica registros.
-- Sustituir empresa_id si se ejecuta para otro tenant.

-- A) Detalle de ingresos PEN inconsistentes.
with params as (
  select '07593982-08e6-450c-8abe-4bf590609dd7'::uuid as empresa_id
)
select
  i.id,
  i.fecha,
  i.monto,
  i.monto_pen_referencia,
  round((i.monto_pen_referencia - i.monto)::numeric, 2) as diferencia,
  i.tipo,
  i.sub_tipo as subtipo,
  i.vehicle_id as vehiculo_id,
  v.placa as vehiculo_placa,
  i.created_at,
  (
    select max(a.created_at)
    from public.financial_audit_logs a
    where a.empresa_id = i.empresa_id
      and a.entity_type = 'ingreso'
      and a.entity_id = i.id::text
      and a.action_type = 'edit_income'
  ) as ultima_edicion
from public.ingresos i
cross join params p
left join public.vehiculos v
  on v.id = i.vehicle_id
 and v.empresa_id = i.empresa_id
where i.empresa_id = p.empresa_id
  and coalesce(i.moneda, 'PEN') = 'PEN'
  and i.monto_pen_referencia is not null
  and abs(i.monto - i.monto_pen_referencia) > 0.005
order by i.fecha desc, i.created_at desc, i.id;

-- B) Cantidad total y suma neta de la diferencia (referencia menos monto).
with params as (
  select '07593982-08e6-450c-8abe-4bf590609dd7'::uuid as empresa_id
)
select
  count(*) as cantidad_inconsistentes,
  round(sum(i.monto_pen_referencia - i.monto)::numeric, 2) as suma_total_diferencia
from public.ingresos i
cross join params p
where i.empresa_id = p.empresa_id
  and coalesce(i.moneda, 'PEN') = 'PEN'
  and i.monto_pen_referencia is not null
  and abs(i.monto - i.monto_pen_referencia) > 0.005;

-- C) Desglose mensual por fecha efectiva del ingreso.
with params as (
  select '07593982-08e6-450c-8abe-4bf590609dd7'::uuid as empresa_id
)
select
  to_char(date_trunc('month', i.fecha), 'YYYY-MM') as mes,
  count(*) as cantidad_inconsistentes,
  round(sum(i.monto)::numeric, 2) as suma_monto,
  round(sum(i.monto_pen_referencia)::numeric, 2) as suma_referencia,
  round(sum(i.monto_pen_referencia - i.monto)::numeric, 2) as suma_diferencia
from public.ingresos i
cross join params p
where i.empresa_id = p.empresa_id
  and coalesce(i.moneda, 'PEN') = 'PEN'
  and i.monto_pen_referencia is not null
  and abs(i.monto - i.monto_pen_referencia) > 0.005
group by date_trunc('month', i.fecha)
order by date_trunc('month', i.fecha) desc;
