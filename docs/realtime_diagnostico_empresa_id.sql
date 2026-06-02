-- Diagnóstico Realtime: empresa_id + publication + perfiles
-- Ejecutar en Supabase SQL Editor (admin del proyecto).

-- 1) Publication activa
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- 2) Últimos kilometrajes — ¿tienen empresa_id?
SELECT id, empresa_id, vehiculo_id, km, fecha, created_at
FROM public.kilometrajes
ORDER BY created_at DESC NULLS LAST, id DESC
LIMIT 10;

-- 3) Últimos ingresos — ¿tienen empresa_id?
SELECT id, empresa_id, monto, fecha, created_at
FROM public.ingresos
ORDER BY created_at DESC NULLS LAST, id DESC
LIMIT 10;

-- 4) Perfiles admin vs contador (reemplazar emails)
SELECT id, email, role, empresa_id, is_active
FROM public.user_profiles
WHERE email IN ('admin@ejemplo.com', 'contador@ejemplo.com')
ORDER BY email;

-- 5) ¿Misma empresa en filas recientes y perfil admin?
-- Reemplazar el UUID abajo por empresaRealtimeId de [realtime:boot:json]
-- WITH params AS (SELECT '00000000-0000-0000-0000-000000000000'::uuid AS empresa_admin)
SELECT
  'kilometrajes' AS tabla,
  COUNT(*) FILTER (WHERE empresa_id = '00000000-0000-0000-0000-000000000000'::uuid) AS filas_misma_empresa,
  COUNT(*) FILTER (WHERE empresa_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000000'::uuid) AS filas_otra_empresa,
  COUNT(*) FILTER (WHERE empresa_id IS NULL) AS filas_sin_empresa
FROM public.kilometrajes
WHERE created_at > NOW() - INTERVAL '7 days';

SELECT
  'ingresos' AS tabla,
  COUNT(*) FILTER (WHERE empresa_id = '00000000-0000-0000-0000-000000000000'::uuid) AS filas_misma_empresa,
  COUNT(*) FILTER (WHERE empresa_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000000'::uuid) AS filas_otra_empresa,
  COUNT(*) FILTER (WHERE empresa_id IS NULL) AS filas_sin_empresa
FROM public.ingresos
WHERE created_at > NOW() - INTERVAL '7 days';

-- 6) REPLICA IDENTITY (DELETE/UPDATE en realtime necesitan FULL en algunos casos)
SELECT c.relname AS table_name, c.relreplident AS replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('kilometrajes', 'ingresos', 'gastos', 'control_fechas', 'financial_audit_logs');

-- Interpretación frontend (canal debug-all-changes, solo DEV):
-- • [realtime:debug:kilometrajes:any] SÍ + [realtime:raw] NO → filtro empresa_id=eq.X incorrecto
-- • ningún [realtime:debug:*:any] → RLS SELECT / publication / JWT del suscriptor
