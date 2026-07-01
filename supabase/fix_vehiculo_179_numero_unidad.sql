-- Corrección puntual: vehículo CCQ586 (id 179) creado sin numero_unidad en INSERT legacy.
-- NO modifica id, secuencias ni FKs.

UPDATE public.vehiculos
SET numero_unidad = 84
WHERE id = 179
  AND placa = 'CCQ586'
  AND numero_unidad IS NULL;

-- ── Validación (solo lectura) ─────────────────────────────────────────────
-- SELECT id, placa, numero_unidad FROM public.vehiculos WHERE id IN (178, 179);
-- Esperado: 178 CAU-677 → 83 | 179 CCQ586 → 84
--
-- SELECT COUNT(*) FROM public.vehiculos WHERE numero_unidad IS NULL;
-- Esperado: 0
