-- =============================================================================
-- LM-03 — Gestión de roles (solo 2 administradores principales por UUID)
-- NO ejecutar en producción sin aprobación explícita + staging validado.
-- =============================================================================
-- Identidades verificadas (La Moneda):
--   Diego SB     diegosb0301@gmail.com     2418065a-e7b1-41b6-840d-b49dfa353285
--   Álvaro SB24  alvarosb24@gmail.com      9cd68f28-e1dc-4e6b-bbb4-fb557ea1c87f
-- Admin operativo SIN gestión de roles:
--   alvarosalasvelarde@gmail.com          d666cb8f-8788-4579-8da2-eb19bbbb31c6
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers: gestor de roles (independiente de rol admin operativo)
-- IMMUTABLE: sin acceso a tablas → no requiere SECURITY DEFINER.
-- ---------------------------------------------------------------------------
create or replace function public.is_lm_role_manager(p_user_id uuid default auth.uid())
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select p_user_id in (
    '2418065a-e7b1-41b6-840d-b49dfa353285'::uuid,
    '9cd68f28-e1dc-4e6b-bbb4-fb557ea1c87f'::uuid
  );
$$;

create or replace function public.is_lm_protected_role_manager(p_user_id uuid)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select public.is_lm_role_manager(p_user_id);
$$;

revoke all on function public.is_lm_role_manager(uuid) from public;
revoke all on function public.is_lm_protected_role_manager(uuid) from public;
grant execute on function public.is_lm_role_manager(uuid) to authenticated;
grant execute on function public.is_lm_protected_role_manager(uuid) to authenticated;

comment on function public.is_lm_role_manager(uuid) is
  'LM-03: true solo Diego SB y Álvaro SB24 (UUID). No equivale a is_admin().';

-- RLS helper: compara rol nuevo contra fila persistida (SECURITY DEFINER lectura).
-- Necesario porque WITH CHECK solo no garantiza inmutabilidad de columnas.
create or replace function public.user_profiles_role_column_unchanged(
  p_profile_id uuid,
  p_new_role text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_new_role is not distinct from (
    select up.role from public.user_profiles up where up.id = p_profile_id limit 1
  );
$$;

revoke all on function public.user_profiles_role_column_unchanged(uuid, text) from public;
grant execute on function public.user_profiles_role_column_unchanged(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1) Auditoría
-- ---------------------------------------------------------------------------
create table if not exists public.user_role_change_log (
  id bigserial primary key,
  empresa_id uuid not null,
  actor_user_id uuid not null references public.user_profiles(id),
  target_user_id uuid not null references public.user_profiles(id),
  old_role text not null,
  new_role text not null,
  created_at timestamptz not null default now(),
  constraint user_role_change_log_role_old_chk check (old_role in ('admin', 'socio', 'contador', 'operador')),
  constraint user_role_change_log_role_new_chk check (new_role in ('admin', 'socio', 'contador', 'operador'))
);

create index if not exists user_role_change_log_empresa_created_idx
  on public.user_role_change_log (empresa_id, created_at desc);

alter table public.user_role_change_log enable row level security;
alter table public.user_role_change_log force row level security;

drop policy if exists "user_role_change_log_select_admin_tenant" on public.user_role_change_log;
drop policy if exists "user_role_change_log_select_role_managers" on public.user_role_change_log;
create policy "user_role_change_log_select_role_managers"
  on public.user_role_change_log
  for select
  to authenticated
  using (
    public.is_active_user() = true
    and public.is_lm_role_manager() = true
    and empresa_id = public.current_user_empresa_id()
  );

revoke all on table public.user_role_change_log from public, anon, authenticated;
grant select on table public.user_role_change_log to authenticated;
-- Sin INSERT/UPDATE/DELETE para authenticated → solo RPC SECURITY DEFINER inserta.

-- ---------------------------------------------------------------------------
-- 2) Inmutabilidad de role (trigger + RLS; no confiar solo en RLS)
-- ---------------------------------------------------------------------------
create or replace function public.guard_user_profiles_role_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_token uuid;
begin
  if old.role is distinct from new.role then
    begin
      v_token := nullif(trim(current_setting('app.lm03_role_change', true)), '')::uuid;
    exception
      when invalid_text_representation then
        v_token := null;
    end;
    -- Solo RPC fija el token al actor; validar gestor (no depender de auth.uid() en DEFINER).
    if v_token is null or public.is_lm_role_manager(v_token) <> true then
      raise exception 'role_change_requires_rpc'
        using errcode = '42501',
              message = 'Los cambios de rol deben usar admin_update_user_role().';
    end if;
    perform set_config('app.lm03_role_change', '', true);
  end if;
  return new;
end;
$$;

revoke all on function public.guard_user_profiles_role_update() from public;

drop trigger if exists trg_guard_user_profiles_role_update on public.user_profiles;
create trigger trg_guard_user_profiles_role_update
  before update on public.user_profiles
  for each row
  execute function public.guard_user_profiles_role_update();

drop policy if exists "user_profiles_update_admin_tenant" on public.user_profiles;
create policy "user_profiles_update_admin_tenant"
  on public.user_profiles
  for update
  to authenticated
  using (
    public.is_active_user() = true
    and public.is_admin() = true
    and empresa_id = public.current_user_empresa_id()
  )
  with check (
    public.is_active_user() = true
    and public.is_admin() = true
    and empresa_id = public.current_user_empresa_id()
    and public.user_profiles_role_column_unchanged(user_profiles.id, user_profiles.role)
  );

comment on policy "user_profiles_update_admin_tenant" on public.user_profiles is
  'Admin operativo: UPDATE tenant excepto role (función + trigger + RPC).';

-- ---------------------------------------------------------------------------
-- 3) RPC — único camino para cambiar role (SECURITY DEFINER bypass RLS en UPDATE)
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_user_role(
  p_target_user_id uuid,
  p_new_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_empresa uuid;
  v_target record;
  v_rows int;
begin
  if v_actor_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if public.is_active_user() <> true then
    raise exception 'inactive_user' using errcode = '42501';
  end if;

  if public.is_lm_role_manager(v_actor_id) <> true then
    raise exception 'not_role_manager' using errcode = '42501';
  end if;

  v_empresa := public.current_user_empresa_id();
  if v_empresa is null then
    raise exception 'missing_empresa' using errcode = '22023';
  end if;

  if p_target_user_id = v_actor_id then
    raise exception 'self_role_change' using errcode = '42501';
  end if;

  if p_new_role is null or p_new_role not in ('admin', 'contador') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  select id, email, role, is_active, empresa_id
  into v_target
  from public.user_profiles
  where id = p_target_user_id
  for update;

  if not found then
    raise exception 'target_not_found' using errcode = 'P0002';
  end if;

  if v_target.empresa_id is distinct from v_empresa then
    raise exception 'tenant_mismatch' using errcode = '42501';
  end if;

  if coalesce(v_target.is_active, false) <> true then
    raise exception 'target_inactive' using errcode = '42501';
  end if;

  if v_target.role not in ('admin', 'contador') then
    raise exception 'legacy_role' using errcode = '42501';
  end if;

  if public.is_lm_protected_role_manager(v_target.id)
     and v_target.role = 'admin'
     and p_new_role <> 'admin' then
    raise exception 'protected_primary_admin' using errcode = '42501';
  end if;

  if v_target.role = p_new_role then
    return;
  end if;

  perform set_config('app.lm03_role_change', v_actor_id::text, true);

  update public.user_profiles
  set role = p_new_role
  where id = p_target_user_id
    and role = v_target.role;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    perform set_config('app.lm03_role_change', '', true);
    raise exception 'concurrent_role_change' using errcode = 'P0002';
  end if;

  insert into public.user_role_change_log (
    empresa_id,
    actor_user_id,
    target_user_id,
    old_role,
    new_role
  ) values (
    v_empresa,
    v_actor_id,
    p_target_user_id,
    v_target.role,
    p_new_role
  );

  perform set_config('app.lm03_role_change', '', true);
exception
  when others then
    perform set_config('app.lm03_role_change', '', true);
    raise;
end;
$$;

revoke all on function public.admin_update_user_role(uuid, text) from public;
grant execute on function public.admin_update_user_role(uuid, text) to authenticated;

comment on function public.admin_update_user_role(uuid, text) is
  'LM-03: solo gestores UUID Diego/Álvaro SB24; admin↔contador; audita en user_role_change_log.';

-- ---------------------------------------------------------------------------
-- 4) Realtime user_profiles
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.user_profiles;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Verificación idempotente (no falla si ya aplicado)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_update_user_role'
  ) then
    raise exception 'LM-03: admin_update_user_role no creada';
  end if;
end $$;
