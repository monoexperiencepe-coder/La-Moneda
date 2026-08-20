-- Agrega 'otros_gastos_varios' a la lista de categorías permitidas en RLS.
--
-- Por qué: gasto_tipo_gasto_permitido es la función whitelist usada en:
--   1. can_update_gasto_check (WITH CHECK de UPDATE) → sin esta entrada el UPDATE falla
--   2. can_read_gasto (SELECT) → gastos con tipo 'otros_gastos_varios' serían invisibles
--   3. can_insert_gasto (INSERT) → inserción directa también falla
--   4. classify_gasto_operador_rpc → clasificación vía operador también falla
--
-- Esta migración es idempotente: CREATE OR REPLACE no altera otros objetos.
-- No modifica datos, policies ni otras funciones.

create or replace function public.gasto_tipo_gasto_permitido(p_tipo text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select public.gastos_canonical_tipo_gasto(p_tipo, false) in (
    'operativo_vehiculo',
    'operativo_flota_general',
    'gastos_globales',
    'administrativo_empresa',
    'financiero_prestamo',
    'planilla_laboral',
    'inversion_compra',
    'representacion_interna',
    'otros_gastos_varios',
    'pendiente_revision'
  );
$$;

comment on function public.gasto_tipo_gasto_permitido(text) is
  'true si tipo_gasto (o alias legacy) es una categoría financiera canónica admitida en la app (incluye otros_gastos_varios).';
