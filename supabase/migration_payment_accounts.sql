-- Configuración editable de destinos de pago por empresa.
-- REVISAR y ejecutar manualmente en Supabase antes de publicar el frontend.

create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  method text not null check (method in ('Yape','Plin','Transferencia','Efectivo','Otros','Tarjeta')),
  label text not null check (length(trim(label)) > 0),
  phone_number text,
  bank_name text,
  account_number text,
  cci text,
  account_holder text,
  payment_note text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint payment_accounts_method_fields_check check (
    (method in ('Yape','Plin') and phone_number is not null and phone_number ~ '^\d{9}$')
    or (method = 'Transferencia' and account_number is not null and length(trim(account_number)) > 0)
    or method in ('Efectivo','Otros','Tarjeta')
  ),
  constraint payment_accounts_cci_check check (cci is null or cci ~ '^\d{20}$')
);

create unique index if not exists payment_accounts_empresa_method_label_uidx
  on public.payment_accounts (empresa_id, method, lower(trim(label)));
create index if not exists payment_accounts_empresa_active_order_idx
  on public.payment_accounts (empresa_id, is_active, sort_order, created_at);

comment on table public.payment_accounts is
  'Destinos editables para operaciones nuevas. Ingresos/gastos conservan snapshots históricos.';

create or replace function public.touch_payment_account()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists payment_accounts_touch on public.payment_accounts;
create trigger payment_accounts_touch before update on public.payment_accounts
for each row execute function public.touch_payment_account();

alter table public.ingresos add column if not exists payment_account_id uuid
  references public.payment_accounts(id) on delete set null;
alter table public.gastos add column if not exists payment_account_id uuid
  references public.payment_accounts(id) on delete set null;
create index if not exists ingresos_payment_account_id_idx on public.ingresos(payment_account_id);
create index if not exists gastos_payment_account_id_idx on public.gastos(payment_account_id);

alter table public.payment_accounts enable row level security;
alter table public.payment_accounts force row level security;

drop policy if exists payment_accounts_select_tenant on public.payment_accounts;
create policy payment_accounts_select_tenant on public.payment_accounts
for select to authenticated using (
  public.is_active_user() and empresa_id = public.current_user_empresa_id()
);

drop policy if exists payment_accounts_insert_finance_roles on public.payment_accounts;
create policy payment_accounts_insert_finance_roles on public.payment_accounts
for insert to authenticated with check (
  public.is_active_user()
  and empresa_id = public.current_user_empresa_id()
  and updated_by = auth.uid()
  and exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and p.is_active = true
      and p.empresa_id = public.payment_accounts.empresa_id and p.role in ('admin','socio','contador')
  )
);

drop policy if exists payment_accounts_update_finance_roles on public.payment_accounts;
create policy payment_accounts_update_finance_roles on public.payment_accounts
for update to authenticated
using (
  public.is_active_user() and empresa_id = public.current_user_empresa_id()
  and exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.is_active = true and p.empresa_id = public.payment_accounts.empresa_id and p.role in ('admin','socio','contador'))
)
with check (
  public.is_active_user() and empresa_id = public.current_user_empresa_id()
  and updated_by = auth.uid()
  and exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.is_active = true and p.empresa_id = public.payment_accounts.empresa_id and p.role in ('admin','socio','contador'))
);

revoke all on public.payment_accounts from public, anon;
grant select, insert, update on public.payment_accounts to authenticated;

-- Seed La Moneda. Preserva etiquetas/números y el orden original, incluido DBS/DSB.
insert into public.payment_accounts
  (empresa_id, method, label, phone_number, bank_name, account_number, sort_order, is_active)
values
  ('07593982-08e6-450c-8abe-4bf590609dd7','Yape','Yape ASB','980649692',null,null,1,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Yape','Yape PIII','965214539',null,null,2,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Yape','Yape DSB','998899861',null,null,3,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Plin','Plin DSB','998899861',null,null,4,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Yape','Yape MPBA','953272617',null,null,5,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Yape','Yape ASV','987338172',null,null,6,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Plin','Plin JORGE SALAS','944354030',null,null,7,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Yape','Yape JUDY SALAS','943381469',null,null,8,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Yape','Yape ANTONELLA GARCIA','948075508',null,null,9,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Yape','Yape CARO HELDEN','914782834',null,null,10,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Plin','Plin ALFREDO SALAS','926729847',null,null,11,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Yape','Yape RODRIGO BRITTO','943525141',null,null,12,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Yape','Yape GONZALO BRITTO','939675311',null,null,13,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Plin','Plin PAUL ABANTO','914782834',null,null,14,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Plin','Plin MARISOL ROMERO','939675311',null,null,15,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Yape','Yape CARLOS ANDRES PUERTAS','917414740',null,null,16,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Yape','Yape EDWARD HELDEN','982319936',null,null,17,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Plin','Plin ADRIAN MAURICIO REVOLO TAIPE','917414740',null,null,18,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Plin','Plin ALCIDES CHIQUEZ BADA','926973183',null,null,19,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Transferencia','ASB',null,'BCP','19490345567046',20,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Transferencia','DBS',null,'BCP','19102291712060',21,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Transferencia','Jorge',null,'BCP','19177432753000',22,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Transferencia','Pia',null,'BCP','19495455963062',23,true),
  ('07593982-08e6-450c-8abe-4bf590609dd7','Transferencia','Operaciones',null,'BCP','19300111222334',24,true)
on conflict (empresa_id, method, (lower(trim(label)))) do nothing;
