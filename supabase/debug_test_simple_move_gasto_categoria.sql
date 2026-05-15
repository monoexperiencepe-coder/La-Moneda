-- Diagnóstico: aislar error invalid input syntax for type uuid: "0"
-- Sustituir :gasto_id por el id real (bigint).
--
-- Si ESTE script falla en SQL Editor → causa en DB (trigger, CHECK, FK, columna generada, cast, etc.).
-- Si funciona aquí pero falla window.testSimpleMoveCategoria → RLS / rol / PostgREST / payload distinto.

UPDATE public.gastos
SET
  tipo_gasto = 'representacion_interna',
  subtipo_gasto = 'gasto_representacion',
  vehicle_id = NULL,
  es_global_flota = TRUE
WHERE id = 0; -- cambiar

-- --- Metadatos en la BD remota (no están en este repo) ---
-- Triggers en public.gastos:
-- SELECT tgname, pg_get_triggerdef(oid, true)
-- FROM pg_trigger
-- WHERE NOT tgisinternal AND tgrelid = 'public.gastos'::regclass;

-- Columnas generadas / defaults (buscar uuid):
-- SELECT column_name, data_type, column_default, is_generated, generation_expression
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'gastos'
-- ORDER BY ordinal_position;

-- FKs desde public.gastos:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'public.gastos'::regclass AND contype = 'f';

-- RLS y políticas:
-- SELECT polname, cmd, qual::text, with_check::text
-- FROM pg_policy WHERE polrelid = 'public.gastos'::regclass;
