-- Perfil de usuario vinculado a auth.users.
-- Permite asignar roles a cada cuenta autenticada.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'operador'
    check (role in ('admin', 'socio', 'contador', 'operador')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- El propio usuario puede leer su perfil.
alter table public.user_profiles enable row level security;

create policy "user can read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

-- Solo service_role o el propio usuario pueden escribir.
create policy "user can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id);

comment on table public.user_profiles is
  'Perfil extendido de usuarios de Supabase Auth. El rol controla permisos en la app.';
