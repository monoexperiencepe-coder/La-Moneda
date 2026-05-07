-- Auditoría financiera simple (frontend + Supabase anon/service según políticas).
-- Mantiene trazabilidad de cambios críticos en gastos.

create table if not exists public.financial_audit_logs (
  id bigserial primary key,
  user_id text not null,
  action_type text not null,
  entity_type text not null,
  entity_id text not null,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists financial_audit_logs_created_at_idx
  on public.financial_audit_logs (created_at desc);

create index if not exists financial_audit_logs_entity_idx
  on public.financial_audit_logs (entity_type, entity_id);
