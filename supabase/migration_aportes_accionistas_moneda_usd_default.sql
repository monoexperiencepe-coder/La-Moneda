-- Aportes de accionistas: los montos del negocio van en USD.
-- Nuevas filas sin moneda explícita quedan en USD (antes default PEN).

alter table public.aportes_accionistas
  alter column moneda set default 'USD';

comment on column public.aportes_accionistas.moneda is
  'PEN o USD; aportes de capital se registran en USD por convención del negocio.';

-- Si todo el histórico es en dólares pero quedó PEN por el default antiguo, ejecutar una vez (ajustar WHERE):
-- update public.aportes_accionistas set moneda = 'USD' where moneda = 'PEN';
