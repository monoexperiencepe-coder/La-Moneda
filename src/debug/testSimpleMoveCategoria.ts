import { supabase } from '../lib/supabase';

/**
 * Diagnóstico temporal: un solo UPDATE por PostgREST, sin auditoría, merge, excel_extra ni helpers.
 *
 * En dev, consola del navegador:
 *   await window.testSimpleMoveCategoria('uuid-de-la-fila')
 *   await window.testSimpleMoveCategoria(12345) // si la PK fuera bigint
 */
const MINIMAL_PATCH = {
  tipo_gasto: 'representacion_interna',
  subtipo_gasto: 'gasto_representacion',
  vehicle_id: null,
  es_global_flota: true,
} as const;

export type TestSimpleMoveCategoriaResult = {
  ok: boolean;
  data: unknown;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
};

function gastoIdForSqlLog(id: string | number): string {
  const s = String(id).trim();
  if (/^[1-9]\d*$/.test(s)) return s;
  return `'${s.replace(/'/g, "''")}'`;
}

export async function testSimpleMoveCategoria(
  gastoId: string | number,
): Promise<TestSimpleMoveCategoriaResult> {
  const idStr = String(gastoId).trim();
  const patch = { ...MINIMAL_PATCH };
  const table = 'gastos';
  const filter = { id: idStr };

  console.log('[testSimpleMoveCategoria] table:', table);
  console.log('[testSimpleMoveCategoria] filter (eq):', JSON.stringify(filter));
  console.log('[testSimpleMoveCategoria] PATCH body (PostgREST JSON):', JSON.stringify(patch));
  console.log(
    '[testSimpleMoveCategoria] SQL equivalente (Supabase SQL Editor, rol que tú elijas):',
    `\nUPDATE public.gastos\nSET tipo_gasto = 'representacion_interna',\n    subtipo_gasto = 'gasto_representacion',\n    vehicle_id = NULL,\n    es_global_flota = TRUE\nWHERE id = ${gastoIdForSqlLog(idStr)};`,
  );

  const { data, error } = await supabase
    .from(table)
    .update(patch as Record<string, unknown>)
    .eq('id', idStr)
    .select('id, empresa_id, tipo_gasto, subtipo_gasto, vehicle_id, es_global_flota')
    .maybeSingle();

  if (error) {
    console.error('[testSimpleMoveCategoria] Supabase error:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return {
      ok: false,
      data: null,
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
    };
  }

  if (!error && data == null) {
    console.warn(
      '[testSimpleMoveCategoria] Sin fila devuelta (0 updates o sin permiso SELECT tras UPDATE). Revisa id y RLS.',
    );
  }

  console.log('[testSimpleMoveCategoria] row returned:', data);
  return { ok: data != null, data: data ?? null, error: null };
}
