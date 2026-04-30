-- Contexto operativo de negocio (enriquece ingresos/gastos sin tocar columnas existentes).
-- Ejecutar en Supabase SQL editor o con CLI tras revisar.

alter table public.ingresos add column if not exists detalle_operativo text;
alter table public.ingresos add column if not exists tipo_operacion text;
alter table public.ingresos add column if not exists estado_pago text;

alter table public.gastos add column if not exists detalle_operativo text;
alter table public.gastos add column if not exists categoria_real text;
alter table public.gastos add column if not exists subcategoria text;

comment on column public.ingresos.detalle_operativo is
  'Resumen de contexto (p. ej. detalle de unidad + comentarios); no sustituye comentarios.';
comment on column public.ingresos.tipo_operacion is
  'Línea de negocio derivada de tipo/sub_tipo (Fact / Excel).';
comment on column public.ingresos.estado_pago is
  'Estado inferido o explícito (p. ej. PENDIENTE, PAGADO); null si no aplica.';

comment on column public.gastos.detalle_operativo is
  'Resumen de contexto (detalle de unidad + comentarios).';
comment on column public.gastos.categoria_real is
  'Categoría tal como en Excel o tipo Fact cuando no hay categoría de hoja.';
comment on column public.gastos.subcategoria is
  'Subtipo / refinamiento (p. ej. sub_tipo Fact o detalle corto).';
