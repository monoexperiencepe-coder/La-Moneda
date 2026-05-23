-- =============================================================================
-- RPC diagnóstico — debug_can_update_gasto_row (uuid PK)
-- =============================================================================
-- Fix: v_row public.gastos%ROWTYPE — sin alias "g" que colisiona con record PL/pgSQL.
-- NO modifica datos. NO CASCADE.
-- =============================================================================

begin;

drop function if exists public.debug_can_update_gasto_row(bigint, text, text);

create or replace function public.debug_can_update_gasto_row(
  p_gasto_id uuid,
  p_target_tipo text default 'operativo_flota_general',
  p_target_subtipo text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.gastos%ROWTYPE;
  v_empresa uuid;
  v_role text;
  v_active boolean;
  v_restricted boolean;
  v_using boolean;
  v_check boolean;
  v_read_old boolean;
  v_old_visible boolean;
  v_old_permitido boolean;
  v_target_permitido boolean;
  v_old_canon text;
begin
  if p_gasto_id is null then
    return jsonb_build_object('found', false, 'reason', 'p_gasto_id_null');
  end if;

  perform public.rls_profile_cache_ensure();

  v_empresa := public.current_user_empresa_id();
  v_role := public.current_user_role();
  v_active := public.is_active_user();
  v_restricted := public.is_restricted_operador_account();

  select *
  into v_row
  from public.gastos
  where id = p_gasto_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'found', false,
      'gasto_id', p_gasto_id,
      'reason', 'gasto_not_found',
      'usuario', jsonb_build_object(
        'auth_uid', public.rls_auth_uid(),
        'current_user_empresa_id', v_empresa,
        'current_user_role', v_role,
        'is_active_user', v_active,
        'is_restricted_operador_account', v_restricted
      )
    );
  end if;

  v_old_canon := public.gastos_canonical_tipo_gasto(v_row.tipo_gasto, v_row.vehicle_id is not null);
  v_old_visible := public.gasto_tipo_operador_visible(v_row.tipo_gasto)
    or v_old_canon in ('gastos_globales', 'pendiente_revision');
  v_old_permitido := public.gasto_tipo_gasto_permitido(v_row.tipo_gasto);
  v_target_permitido := public.gasto_tipo_gasto_permitido(p_target_tipo);
  v_read_old := public.can_read_gasto(v_row.tipo_gasto, v_row.empresa_id);
  v_using := public.can_update_gasto_using(v_row.tipo_gasto, v_row.empresa_id);
  v_check := public.can_update_gasto_check(p_target_tipo, v_row.empresa_id);

  return jsonb_build_object(
    'found', true,
    'gasto_id', v_row.id,
    'old_tipo', v_row.tipo_gasto,
    'old_tipo_canon', v_old_canon,
    'old_subtipo', v_row.subtipo_gasto,
    'old_empresa_id', v_row.empresa_id,
    'old_vehicle_id', v_row.vehicle_id,
    'old_es_global_flota', v_row.es_global_flota,
    'old_requiere_revision', v_row.requiere_revision,
    'old_clasificacion_manual', v_row.clasificacion_manual,
    'target_tipo', p_target_tipo,
    'target_subtipo', p_target_subtipo,
    'old_tipo_visible_operador', v_old_visible,
    'old_tipo_permitido', v_old_permitido,
    'target_tipo_permitido', v_target_permitido,
    'can_read_old', v_read_old,
    'can_using_old', v_using,
    'can_check_target', v_check,
    'would_pass_update_policy', v_using and v_check,
    'usuario', jsonb_build_object(
      'auth_uid', public.rls_auth_uid(),
      'current_user_empresa_id', v_empresa,
      'current_user_role', v_role,
      'is_active_user', v_active,
      'is_restricted_operador_account', v_restricted
    ),
    'reason_flags', jsonb_build_object(
      'tenant_mismatch',
        v_empresa is null or v_row.empresa_id is null or v_row.empresa_id::text <> v_empresa::text,
      'not_active_user', not v_active,
      'using_fail_operador_old_not_visible',
        v_restricted and not v_old_visible,
      'using_fail_finanzas_role',
        not v_restricted and v_role not in ('admin', 'contador', 'socio'),
      'check_fail_target_not_permitido', not v_target_permitido,
      'check_fail_finanzas_role',
        not v_restricted and v_role not in ('admin', 'contador', 'socio'),
      'old_tipo_legacy_operativo_flota_global',
        lower(trim(coalesce(v_row.tipo_gasto, ''))) = 'operativo_flota_global',
      'old_tipo_empty_or_null',
        nullif(btrim(coalesce(v_row.tipo_gasto, '')), '') is null
    ),
    'policy_hint', case
      when not v_using then '403 USING: fila OLD no editable (tipo legacy o no visible operador)'
      when not v_check then '403 WITH CHECK: destino o rol/tenant rechazado por helper'
      when v_using and v_check then
        'Helpers OK; si PATCH 403 persiste usar classify_gasto_operador RPC'
      else 'revisar'
    end
  );
end;
$$;

comment on function public.debug_can_update_gasto_row(uuid, text, text) is
  'Diagnóstico fila gastos (PK uuid): USING OLD + WITH CHECK destino.';

revoke all on function public.debug_can_update_gasto_row(uuid, text, text) from public;
grant execute on function public.debug_can_update_gasto_row(uuid, text, text) to authenticated;

commit;
