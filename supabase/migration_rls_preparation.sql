-- =============================================================================
-- Preparación RLS (Fase 0) — LA MONEDA
-- =============================================================================
-- Objetivo: empresa_id en perfiles y auditoría, helpers SQL para políticas futuras.
--
-- NO activa RLS en tablas operativas (gastos, vehiculos, etc.).
-- NO crea políticas nuevas en tablas de negocio.
-- Ejecutar en Supabase SQL Editor (o CLI) en un entorno de staging primero.
--
-- Empresa tenant inicial (La Moneda):
--   07593982-08e6-450c-8abe-4bf590609dd7
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0) Constante de empresa (validación)
-- ---------------------------------------------------------------------------
do $$
declare
  v_empresa uuid := '07593982-08e6-450c-8abe-4bf590609dd7'::uuid;
  v_exists boolean;
begin
  select exists(select 1 from public.empresas e where e.id = v_empresa) into v_exists;
  if not v_exists then
    raise exception
      'RLS prep: no existe public.empresas.id = %. Crear la fila de empresa antes de continuar.',
      v_empresa;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) user_profiles.empresa_id
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists empresa_id uuid;

comment on column public.user_profiles.empresa_id is
  'Tenant del usuario. Usado por current_user_empresa_id() en políticas RLS futuras.';

update public.user_profiles
set empresa_id = '07593982-08e6-450c-8abe-4bf590609dd7'::uuid
where empresa_id is null;

-- FK solo si no existe
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_profiles_empresa_id_fkey'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_empresa_id_fkey
      foreign key (empresa_id) references public.empresas (id) on delete restrict;
  end if;
end $$;

alter table public.user_profiles
  alter column empresa_id set not null;

create index if not exists user_profiles_empresa_id_idx
  on public.user_profiles (empresa_id);

-- ---------------------------------------------------------------------------
-- 2) Helpers SQL para políticas RLS (futuras)
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER + search_path fijo: leen user_profiles por auth.uid().
-- GRANT a authenticated (y service_role implícito).

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role::text
  from public.user_profiles p
  where p.id = auth.uid()
  limit 1;
$$;

comment on function public.current_user_role() is
  'Rol del usuario autenticado (admin|socio|contador|operador). NULL si sin perfil.';

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
    and p.is_active = true
  limit 1;
$$;

comment on function public.current_user_empresa_id() is
  'empresa_id del usuario activo. NULL si sin sesión, inactivo o perfil incompleto.';

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_active
      from public.user_profiles p
      where p.id = auth.uid()
      limit 1
    ),
    false
  );
$$;

comment on function public.is_active_user() is
  'true si auth.uid() tiene fila en user_profiles con is_active = true.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.role = 'admin' and p.is_active
      from public.user_profiles p
      where p.id = auth.uid()
      limit 1
    ),
    false
  );
$$;

comment on function public.is_admin() is
  'true si el usuario autenticado es admin activo.';

revoke all on function public.current_user_role() from public;
revoke all on function public.current_user_empresa_id() from public;
revoke all on function public.is_active_user() from public;
revoke all on function public.is_admin() from public;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_empresa_id() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) financial_audit_logs.empresa_id
-- ---------------------------------------------------------------------------
-- Esquema vigente en app: id bigserial, user_id text, action_type, old_data, new_data, reason.
-- (Si en BD existe otro esquema v3 legacy, revisar diagnostico_rls_prep_empresa_id.sql)

alter table public.financial_audit_logs
  add column if not exists empresa_id uuid;

comment on column public.financial_audit_logs.empresa_id is
  'Tenant del evento de auditoría. Filtro realtime y RLS futuro por empresa.';

update public.financial_audit_logs fal
set empresa_id = '07593982-08e6-450c-8abe-4bf590609dd7'::uuid
where fal.empresa_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'financial_audit_logs_empresa_id_fkey'
      and conrelid = 'public.financial_audit_logs'::regclass
  ) then
    alter table public.financial_audit_logs
      add constraint financial_audit_logs_empresa_id_fkey
      foreign key (empresa_id) references public.empresas (id) on delete restrict;
  end if;
end $$;

alter table public.financial_audit_logs
  alter column empresa_id set not null;

create index if not exists financial_audit_logs_empresa_created_idx
  on public.financial_audit_logs (empresa_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4) prestamos_tramos.empresa_id (denormalizado — prep realtime / RLS simple)
-- ---------------------------------------------------------------------------
-- Alternativa sin columna: políticas con EXISTS (SELECT 1 FROM prestamos_financieros pf …).
-- Se añade empresa_id denormalizado para filtros Realtime y políticas más baratas.
-- Sincronizado desde prestamos_financieros vía trigger.

alter table public.prestamos_tramos
  add column if not exists empresa_id uuid;

comment on column public.prestamos_tramos.empresa_id is
  'Denormalizado desde prestamos_financieros. No sustituye FK prestamo_financiero_id.';

update public.prestamos_tramos t
set empresa_id = pf.empresa_id
from public.prestamos_financieros pf
where pf.id = t.prestamo_financiero_id
  and t.empresa_id is distinct from pf.empresa_id;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'prestamos_tramos_empresa_id_fkey'
      and conrelid = 'public.prestamos_tramos'::regclass
  ) then
    alter table public.prestamos_tramos
      add constraint prestamos_tramos_empresa_id_fkey
      foreign key (empresa_id) references public.empresas (id) on delete restrict;
  end if;
end $$;

-- NOT NULL solo si todos los tramos tienen préstamo padre válido
do $$
declare
  v_orphans bigint;
begin
  select count(*) into v_orphans
  from public.prestamos_tramos t
  where t.empresa_id is null;

  if v_orphans > 0 then
    raise warning
      'RLS prep: % filas en prestamos_tramos sin empresa_id (préstamo padre huérfano). Corregir antes de SET NOT NULL.',
      v_orphans;
  else
    alter table public.prestamos_tramos
      alter column empresa_id set not null;
  end if;
end $$;

create index if not exists prestamos_tramos_empresa_id_idx
  on public.prestamos_tramos (empresa_id);

create or replace function public.prestamos_tramos_sync_empresa_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa uuid;
begin
  select pf.empresa_id into v_empresa
  from public.prestamos_financieros pf
  where pf.id = new.prestamo_financiero_id;

  if v_empresa is null then
    raise exception 'prestamos_tramos: prestamo_financiero_id % sin empresa_id', new.prestamo_financiero_id;
  end if;

  new.empresa_id := v_empresa;
  return new;
end;
$$;

drop trigger if exists prestamos_tramos_sync_empresa_id_trg on public.prestamos_tramos;
create trigger prestamos_tramos_sync_empresa_id_trg
  before insert or update of prestamo_financiero_id
  on public.prestamos_tramos
  for each row
  execute procedure public.prestamos_tramos_sync_empresa_id();

commit;

-- =============================================================================
-- Verificación rápida (post-migración)
-- =============================================================================
-- select public.current_user_role(), public.current_user_empresa_id(), public.is_admin(), public.is_active_user();
-- select id, email, role, empresa_id from public.user_profiles order by email;
-- select count(*) filter (where empresa_id is null) as sin_empresa from public.financial_audit_logs;
-- select count(*) filter (where empresa_id is null) as sin_empresa from public.prestamos_tramos;
