-- Diagnóstico: préstamos_financieros vs app (VITE_EMPRESA_ID)
-- Ejecutar en Supabase → SQL Editor (rol postgres / bypass RLS).

-- 1) Total de filas en la tabla
select count(*) as total_prestamos from public.prestamos_financieros;

-- 2) empresa_id presentes en préstamos (comparar con VITE_EMPRESA_ID del .env)
select empresa_id, count(*) as n
from public.prestamos_financieros
group by empresa_id
order by n desc;

-- 3) Empresas disponibles (elige el id que debe coincidir con la app)
select *
from public.empresas
order by id;

-- 4) Si sospechas RLS (la app usa usuario autenticado): revisa rol en user_profiles
--    Sustituye el uuid por el auth.users.id del usuario que usa la app.
-- select id, role, is_active from public.user_profiles where id = 'UUID_DEL_USUARIO'::uuid;

-- ---------------------------------------------------------------------------
-- CORRECCIÓN empresa_id (NO ejecutar sin revisar origen y destino)
-- Reemplaza SOURCE_UUID y TARGET_UUID por valores del paso 2 y 3.
-- Los tramos no llevan empresa_id; siguen ligados por prestamo_financiero_id.
-- ---------------------------------------------------------------------------
/*
begin;

update public.prestamos_financieros
set empresa_id = 'TARGET_UUID'::uuid
where empresa_id = 'SOURCE_UUID'::uuid;

commit;
*/

-- ---------------------------------------------------------------------------
-- RLS: las policies actuales solo permiten SELECT a authenticated con rol en
-- ('admin','socio','contador','operador') en user_profiles.
-- Si ves 0 filas en la app pero count(*) > 0 aquí:
--   - Confirma sesión iniciada y que user_profiles.role está permitido.
-- NO se recomienda desactivar RLS salvo entorno local de prueba.
-- Ejemplo policy extra (solo si negocio lo requiere; revisar implicaciones):
/*
drop policy if exists "prestamos_financieros_select_finanzas_extra" on public.prestamos_financieros;
create policy "prestamos_financieros_select_finanzas_extra"
  on public.prestamos_financieros for select to authenticated
  using (true);
*/
