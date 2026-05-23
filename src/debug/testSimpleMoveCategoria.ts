import { supabase } from '../lib/supabase';
import { EMPRESA_ID } from '../config/app';
import { cleanUuid } from '../utils/uuidColumn';
import { fetchDebugCanUpdateGastoRow } from '../services/rlsDebugService';

export type TestSimpleMoveCategoriaOptions = {
  empresaId?: string;
  patch?: {
    tipo_gasto: string;
    subtipo_gasto: string;
    vehicle_id: null;
    es_global_flota: boolean;
  };
  skipSelect?: boolean;
  runRowDiagnostic?: boolean;
  /** Usar RPC classify_gasto_operador (evita 403 WITH CHECK PostgREST). */
  useClassifyRpc?: boolean;
};

export type TestSimpleMoveCategoriaResult = {
  ok: boolean;
  data: unknown;
  rowDiagnostic: unknown;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
  patchSent: Record<string, unknown>;
  filters: { id: string; empresa_id: string | null };
  viaRpc?: boolean;
};

const DEFAULT_MINIMAL_PATCH = {
  tipo_gasto: 'operativo_flota_general',
  subtipo_gasto: 'frenos',
  vehicle_id: null,
  es_global_flota: true,
} as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

function gastoIdForSqlLog(id: string): string {
  const s = id.trim();
  if (isUuid(s)) return `'${s}'::uuid`;
  if (/^[1-9]\d*$/.test(s)) return s;
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Diagnóstico: UPDATE mínimo o RPC classify_gasto_operador.
 *
 *   await window.testSimpleMoveCategoria('d93aab29-5f6c-4330-b402-077587a7d590')
 *   await window.testSimpleMoveCategoria('d93aab29-...', { useClassifyRpc: true })
 */
export async function testSimpleMoveCategoria(
  gastoId: string | number,
  options?: TestSimpleMoveCategoriaOptions,
): Promise<TestSimpleMoveCategoriaResult> {
  const idStr = String(gastoId).trim();
  const patch = { ...(options?.patch ?? DEFAULT_MINIMAL_PATCH) };
  const empresaRaw = (options?.empresaId ?? EMPRESA_ID)?.trim() || '';
  const empresaUuid = cleanUuid(empresaRaw);
  const skipSelect = options?.skipSelect ?? true;
  const runRowDiagnostic = options?.runRowDiagnostic ?? true;
  const useClassifyRpc = options?.useClassifyRpc ?? false;

  console.warn('[testSimpleMoveCategoria] inicio', {
    id: idStr,
    empresa_id_filtro: empresaUuid,
    patch,
    skipSelect,
    useClassifyRpc,
    payloadJson: JSON.stringify(patch),
  });

  let rowDiagnostic: unknown = null;
  if (runRowDiagnostic && isUuid(idStr)) {
    rowDiagnostic = await fetchDebugCanUpdateGastoRow(
      idStr,
      patch.tipo_gasto,
      patch.subtipo_gasto,
    );
    console.warn('[testSimpleMoveCategoria] debug_can_update_gasto_row', rowDiagnostic);
  } else if (runRowDiagnostic) {
    console.warn('[testSimpleMoveCategoria] id no uuid — omitiendo debug_can_update_gasto_row');
  }

  if (useClassifyRpc) {
    if (!empresaUuid) {
      return {
        ok: false,
        data: null,
        rowDiagnostic,
        viaRpc: true,
        patchSent: patch,
        filters: { id: idStr, empresa_id: null },
        error: { message: 'empresa_id inválido para RPC' },
      };
    }
    const { data, error } = await supabase.rpc('classify_gasto_operador', {
      p_gasto_id: idStr,
      p_empresa_id: empresaUuid,
      p_tipo_gasto: patch.tipo_gasto,
      p_subtipo_gasto: patch.subtipo_gasto,
      p_vehicle_id: null,
      p_es_global_flota: patch.es_global_flota,
    });
    if (error) {
      console.error('[testSimpleMoveCategoria] RPC error', error);
      return {
        ok: false,
        data: null,
        rowDiagnostic,
        viaRpc: true,
        patchSent: patch,
        filters: { id: idStr, empresa_id: empresaUuid },
        error: {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
      };
    }
    console.warn('[testSimpleMoveCategoria] RPC resultado', data);
    const ok = (data as { ok?: boolean })?.ok === true;
    return {
      ok,
      data,
      rowDiagnostic,
      viaRpc: true,
      patchSent: patch,
      filters: { id: idStr, empresa_id: empresaUuid },
      error: null,
    };
  }

  let q = supabase.from('gastos').update(patch as Record<string, unknown>).eq('id', idStr);
  if (empresaUuid) {
    q = q.eq('empresa_id', empresaUuid);
  }

  const res = skipSelect
    ? await q
    : await q.select('id, empresa_id, tipo_gasto, subtipo_gasto, vehicle_id, es_global_flota').maybeSingle();

  const error = res.error;
  const data = 'data' in res ? res.data : null;

  if (error) {
    console.error('[testSimpleMoveCategoria] PATCH error', error);
    return {
      ok: false,
      data: null,
      rowDiagnostic,
      patchSent: patch,
      filters: { id: idStr, empresa_id: empresaUuid },
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
    };
  }

  console.warn('[testSimpleMoveCategoria] PATCH ok', { data, skipSelect });
  return {
    ok: skipSelect || data != null,
    data: data ?? null,
    rowDiagnostic,
    patchSent: patch,
    filters: { id: idStr, empresa_id: empresaUuid },
    error: null,
  };
}
