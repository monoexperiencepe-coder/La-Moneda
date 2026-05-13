-- Revertir tabla de auditoría de cambios en préstamos (no afecta préstamos ni tramos).
DROP TABLE IF EXISTS public.prestamo_financiero_historial CASCADE;
