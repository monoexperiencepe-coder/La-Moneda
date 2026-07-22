-- Rollback opcional Módulo Garantías Fase 1.
-- NO toca ingresos, gastos, vehiculos, conductores.
-- Ejecutar solo si se decide retirar el DDL por completo.

drop policy if exists "vehicle_driver_assignments_write" on public.vehicle_driver_assignments;
drop policy if exists "vehicle_driver_assignments_select" on public.vehicle_driver_assignments;
drop policy if exists "guarantee_movements_insert" on public.guarantee_movements;
drop policy if exists "guarantee_movements_select" on public.guarantee_movements;
drop policy if exists "driver_guarantees_update" on public.driver_guarantees;
drop policy if exists "driver_guarantees_insert" on public.driver_guarantees;
drop policy if exists "driver_guarantees_select" on public.driver_guarantees;
drop policy if exists "guarantee_settings_write" on public.guarantee_settings;
drop policy if exists "guarantee_settings_select" on public.guarantee_settings;

drop table if exists public.guarantee_movements;
drop table if exists public.vehicle_driver_assignments;
drop table if exists public.driver_guarantees;
drop table if exists public.guarantee_settings;
