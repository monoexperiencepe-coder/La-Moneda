-- =============================================================================
-- Supabase Realtime — tablas operativas LA MONEDA
-- Ejecutar en SQL Editor del proyecto Supabase (una vez por entorno).
--
-- Sin esto, postgres_changes NO entrega eventos aunque el cliente esté suscrito.
-- Verificar después:
--   SELECT schemaname, tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime';
-- =============================================================================

-- 1) Agregar tablas a la publicación realtime (ignorar error si ya existen)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.gastos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ingresos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.kilometrajes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.control_fechas;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.financial_audit_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.vehiculos;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pendientes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) REPLICA IDENTITY FULL — necesario para DELETE/UPDATE con filtro empresa_id
--    (payload.old debe incluir empresa_id, no solo id)
ALTER TABLE public.gastos REPLICA IDENTITY FULL;
ALTER TABLE public.ingresos REPLICA IDENTITY FULL;
ALTER TABLE public.kilometrajes REPLICA IDENTITY FULL;
ALTER TABLE public.control_fechas REPLICA IDENTITY FULL;
ALTER TABLE public.financial_audit_logs REPLICA IDENTITY FULL;
ALTER TABLE public.vehiculos REPLICA IDENTITY FULL;
ALTER TABLE public.pendientes REPLICA IDENTITY FULL;
