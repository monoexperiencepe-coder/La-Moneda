-- Columnas JSON con columnas Excel no mapeadas (import_system_excel.py → excelColumnasExtra).
-- Nullable: filas antiguas y registros desde la app quedan sin extras.

alter table public.ingresos add column if not exists excel_extra jsonb;

alter table public.gastos add column if not exists excel_extra jsonb;

comment on column public.ingresos.excel_extra is
  'Claves/valores del Excel no incluidos en columnas dedicadas (seed: excelColumnasExtra).';

comment on column public.gastos.excel_extra is
  'Claves/valores del Excel no incluidos en columnas dedicadas (seed: excelColumnasExtra).';
