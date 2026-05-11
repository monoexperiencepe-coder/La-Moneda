-- Inversión inicial total por vehículo (hoja Excel VALOR DE INVERSION).
-- No modifica public.gastos, financiero_prestamo ni inversiones_vehiculo.

create table if not exists public.inversiones_generales_vehiculo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  vehiculo_referencia text not null,
  vehiculo_numero integer,
  placa text,
  modelo text,
  monto_total numeric not null,
  moneda text not null default 'USD' check (moneda in ('PEN', 'USD')),
  fuente text not null default 'VALOR DE INVERSION',
  observaciones text,
  created_at timestamptz not null default now()
);

create unique index if not exists inversiones_generales_vehiculo_empresa_ref_uq
  on public.inversiones_generales_vehiculo (empresa_id, vehiculo_referencia);

create index if not exists inversiones_generales_vehiculo_empresa_id_idx
  on public.inversiones_generales_vehiculo (empresa_id);
create index if not exists inversiones_generales_vehiculo_numero_idx
  on public.inversiones_generales_vehiculo (vehiculo_numero)
  where vehiculo_numero is not null;

comment on table public.inversiones_generales_vehiculo is
  'Total invertido inicial por unidad (compra + gastos para operar), desde Excel; no es gasto operativo de public.gastos.';
comment on column public.inversiones_generales_vehiculo.vehiculo_referencia is
  'Clave estable por fila Excel (texto vehículo/referencia) para UPSERT idempotente.';
comment on column public.inversiones_generales_vehiculo.fuente is
  'Hoja de origen; por defecto VALOR DE INVERSION.';

-- ---------------------------------------------------------------------------
-- RLS (lectura finanzas, mismo criterio que aportes/préstamos)
-- ---------------------------------------------------------------------------
alter table public.inversiones_generales_vehiculo enable row level security;

drop policy if exists "inversiones_generales_vehiculo_select_finanzas" on public.inversiones_generales_vehiculo;
create policy "inversiones_generales_vehiculo_select_finanzas"
  on public.inversiones_generales_vehiculo for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and p.role in ('admin', 'socio', 'contador', 'operador')
    )
  );
