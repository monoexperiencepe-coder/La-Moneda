-- Financiamiento v3: préstamos multi-moneda capital/pago, modalidad tasa_anual | cuota_fija,
-- aportes_accionistas, auditoría futura.
-- NO DROP de préstamos existentes. NO toca gastos ni ingresos.

-- ---------------------------------------------------------------------------
-- prestamos_financieros: columnas nuevas v3
-- ---------------------------------------------------------------------------
alter table public.prestamos_financieros
  add column if not exists titulo text not null default '';

alter table public.prestamos_financieros
  add column if not exists moneda_capital text;

alter table public.prestamos_financieros
  add column if not exists moneda_pago text;

alter table public.prestamos_financieros
  add column if not exists modalidad_pago text not null default 'tasa_anual';

alter table public.prestamos_financieros
  add column if not exists cuota_fija_mensual numeric;

alter table public.prestamos_financieros
  add column if not exists observaciones text not null default '';

alter table public.prestamos_financieros
  alter column tasa_anual drop not null;

-- Datos previos (columna legacy moneda)
update public.prestamos_financieros
set moneda_capital = coalesce(nullif(trim(moneda_capital), ''), moneda)
where moneda_capital is null or trim(moneda_capital) = '';

update public.prestamos_financieros
set moneda_pago = coalesce(nullif(trim(moneda_pago), ''), moneda)
where moneda_pago is null or trim(moneda_pago) = '';

update public.prestamos_financieros
set observaciones = coalesce(nullif(trim(observaciones), ''), notas)
where trim(coalesce(observaciones, '')) = ''
  and trim(coalesce(notas, '')) <> '';

alter table public.prestamos_financieros
  alter column moneda_capital set not null;

alter table public.prestamos_financieros
  alter column moneda_pago set not null;

alter table public.prestamos_financieros drop constraint if exists prestamos_financieros_moneda_capital_chk;
alter table public.prestamos_financieros add constraint prestamos_financieros_moneda_capital_chk
  check (moneda_capital in ('PEN', 'USD'));

alter table public.prestamos_financieros drop constraint if exists prestamos_financieros_moneda_pago_chk;
alter table public.prestamos_financieros add constraint prestamos_financieros_moneda_pago_chk
  check (moneda_pago in ('PEN', 'USD'));

alter table public.prestamos_financieros drop constraint if exists prestamos_financieros_modalidad_chk;
alter table public.prestamos_financieros add constraint prestamos_financieros_modalidad_chk
  check (modalidad_pago in ('tasa_anual', 'cuota_fija'));

comment on column public.prestamos_financieros.modalidad_pago is
  'tasa_anual: cuota derivada de capital × tasa_anual/12; cuota_fija: usar cuota_fija_mensual / interes_mensual_actual.';
comment on column public.prestamos_financieros.observaciones is
  'Texto operativo v3; notas legacy se mantienen para compatibilidad.';

-- ---------------------------------------------------------------------------
-- prestamos_tramos
-- ---------------------------------------------------------------------------
alter table public.prestamos_tramos
  add column if not exists moneda_capital text;

alter table public.prestamos_tramos
  add column if not exists moneda_pago text;

alter table public.prestamos_tramos
  add column if not exists modalidad_pago text not null default 'tasa_anual';

alter table public.prestamos_tramos
  add column if not exists cuota_fija_mensual numeric;

alter table public.prestamos_tramos
  alter column tasa_anual drop not null;

update public.prestamos_tramos t
set moneda_capital = coalesce(nullif(trim(t.moneda_capital), ''), t.moneda),
    moneda_pago = coalesce(nullif(trim(t.moneda_pago), ''), t.moneda)
where t.moneda_capital is null or trim(coalesce(t.moneda_capital, '')) = ''
   or t.moneda_pago is null or trim(coalesce(t.moneda_pago, '')) = '';

alter table public.prestamos_tramos
  alter column moneda_capital set not null;

alter table public.prestamos_tramos
  alter column moneda_pago set not null;

alter table public.prestamos_tramos drop constraint if exists prestamos_tramos_moneda_capital_chk;
alter table public.prestamos_tramos add constraint prestamos_tramos_moneda_capital_chk
  check (moneda_capital in ('PEN', 'USD'));

alter table public.prestamos_tramos drop constraint if exists prestamos_tramos_moneda_pago_chk;
alter table public.prestamos_tramos add constraint prestamos_tramos_moneda_pago_chk
  check (moneda_pago in ('PEN', 'USD'));

-- ---------------------------------------------------------------------------
-- aportes_accionistas
-- ---------------------------------------------------------------------------
create table if not exists public.aportes_accionistas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  accionista text not null default '',
  vehiculo_referencia text,
  monto numeric not null,
  moneda text not null default 'USD' check (moneda in ('PEN', 'USD')),
  fecha_aporte date not null,
  genera_interes boolean not null default false,
  tipo text not null default 'aporte_accionista',
  observaciones text not null default '',
  dedupe_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists aportes_accionistas_empresa_idx on public.aportes_accionistas (empresa_id);
create index if not exists aportes_accionistas_fecha_idx on public.aportes_accionistas (fecha_aporte);

create unique index if not exists aportes_accionistas_dedupe_key_uidx
  on public.aportes_accionistas (dedupe_key);

comment on table public.aportes_accionistas is
  'Aportes de accionistas (capital); no genera interés por defecto; independiente de gastos financiero_prestamo.';

-- ---------------------------------------------------------------------------
-- financial_audit_logs (ediciones manuales futuras desde UI)
-- ---------------------------------------------------------------------------
create table if not exists public.financial_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  payload jsonb,
  metadata jsonb
);

create index if not exists financial_audit_logs_entity_idx
  on public.financial_audit_logs (entity_type, entity_id);

comment on table public.financial_audit_logs is
  'Auditoría de cambios manuales en financiamiento (préstamos/aportes); el seed/import no escribe aquí.';

-- ---------------------------------------------------------------------------
-- RLS (misma idea que préstamos: roles finanzas)
-- ---------------------------------------------------------------------------
alter table public.aportes_accionistas enable row level security;
alter table public.financial_audit_logs enable row level security;

drop policy if exists "aportes_accionistas_select_finanzas" on public.aportes_accionistas;
create policy "aportes_accionistas_select_finanzas"
  on public.aportes_accionistas for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and p.role in ('admin', 'socio', 'contador', 'operador')
    )
  );

drop policy if exists "financial_audit_logs_select_finanzas" on public.financial_audit_logs;
create policy "financial_audit_logs_select_finanzas"
  on public.financial_audit_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid()
        and coalesce(p.is_active, true)
        and p.role in ('admin', 'socio', 'contador', 'operador')
    )
  );
