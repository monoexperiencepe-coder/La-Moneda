-- =============================================================================
-- RPC classify_gasto_operador — mover categoría sin PATCH PostgREST / RLS WITH CHECK
-- =============================================================================
-- Fix: v_row public.gastos%ROWTYPE — no usar alias "g" en FROM/UPDATE (colisión PL/pgSQL).
--
-- NO desactiva RLS. NO modifica datos históricos masivos. NO CASCADE.
-- =============================================================================

begin;

create or replace function public.classify_gasto_operador(
  p_gasto_id uuid,
  p_empresa_id uuid,
  p_tipo_gasto text,
  p_subtipo_gasto text default null,
  p_vehicle_id bigint default null,
  p_es_global_flota boolean default true,
  p_clasificacion_manual boolean default null,
  p_requiere_revision boolean default null,
  p_revisado_por text default null,
  p_revisado_at timestamptz default null,
  p_origen_clasificacion text default null,
  p_excel_extra jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.gastos%ROWTYPE;
  v_empresa uuid;
  v_role text;
  v_restricted boolean;
  v_old_canon text;
  v_old_visible boolean;
  v_moved_out boolean;
  v_rows int;
begin
  if p_gasto_id is null then
    return jsonb_build_object('ok', false, 'error', 'p_gasto_id_null');
  end if;

  perform public.rls_profile_cache_ensure();

  if current_setting('app.rls_is_active', true) <> 't' then
    return jsonb_build_object('ok', false, 'error', 'usuario_inactivo_o_sin_sesion');
  end if;

  v_empresa := public.current_user_empresa_id();
  v_role := public.current_user_role();
  v_restricted := public.is_restricted_operador_account();

  if p_empresa_id is null or v_empresa is null or p_empresa_id <> v_empresa then
    return jsonb_build_object('ok', false, 'error', 'empresa_id_no_coincide_con_perfil');
  end if;

  if not public.gasto_tipo_gasto_permitido(p_tipo_gasto) then
    return jsonb_build_object('ok', false, 'error', 'tipo_gasto_destino_no_permitido');
  end if;

  if not v_restricted and v_role not in ('admin', 'contador', 'socio') then
    return jsonb_build_object('ok', false, 'error', 'rol_sin_permiso_clasificacion');
  end if;

  select *
  into v_row
  from public.gastos
  where id = p_gasto_id
    and empresa_id = p_empresa_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'gasto_no_encontrado_en_tenant');
  end if;

  v_old_canon := public.gastos_canonical_tipo_gasto(v_row.tipo_gasto, v_row.vehicle_id is not null);
  v_old_visible := public.gasto_tipo_operador_visible(v_row.tipo_gasto)
    or v_old_canon in ('gastos_globales', 'pendiente_revision');

  if v_restricted and not v_old_visible then
    return jsonb_build_object(
      'ok', false,
      'error', 'operador_solo_puede_clasificar_globales_o_pendiente',
      'old_tipo', v_row.tipo_gasto,
      'old_tipo_canon', v_old_canon
    );
  end if;

  update public.gastos
  set
    tipo_gasto = btrim(p_tipo_gasto),
    subtipo_gasto = nullif(btrim(coalesce(p_subtipo_gasto, '')), ''),
    vehicle_id = p_vehicle_id,
    es_global_flota = coalesce(p_es_global_flota, true),
    clasificacion_manual = coalesce(p_clasificacion_manual, v_row.clasificacion_manual),
    requiere_revision = coalesce(p_requiere_revision, v_row.requiere_revision),
    revisado_por = coalesce(p_revisado_por, v_row.revisado_por),
    revisado_at = coalesce(p_revisado_at, v_row.revisado_at),
    origen_clasificacion = coalesce(p_origen_clasificacion, v_row.origen_clasificacion),
    excel_extra = coalesce(p_excel_extra, v_row.excel_extra)
  where id = p_gasto_id
    and empresa_id = p_empresa_id;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    return jsonb_build_object('ok', false, 'error', 'update_no_afecto_fila');
  end if;

  v_moved_out := v_restricted
    and not public.gasto_tipo_operador_visible(btrim(p_tipo_gasto));

  return jsonb_build_object(
    'ok', true,
    'gasto_id', p_gasto_id,
    'old_tipo', v_row.tipo_gasto,
    'new_tipo', btrim(p_tipo_gasto),
    'new_subtipo', nullif(btrim(coalesce(p_subtipo_gasto, '')), ''),
    'moved_out_of_view', v_moved_out
  );
end;
$$;

comment on function public.classify_gasto_operador(
  uuid, uuid, text, text, bigint, boolean, boolean, boolean, text, timestamptz, text, jsonb
) is
  'Clasificación manual gasto: operador (globales/pendiente → cualquier tipo) o finanzas tenant. Bypass RLS controlado.';

revoke all on function public.classify_gasto_operador(
  uuid, uuid, text, text, bigint, boolean, boolean, boolean, text, timestamptz, text, jsonb
) from public;

grant execute on function public.classify_gasto_operador(
  uuid, uuid, text, text, bigint, boolean, boolean, boolean, text, timestamptz, text, jsonb
) to authenticated;

commit;
