import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { QA_PREFIX, qaDbWritesEnabled, requireQaCredentials } from './qa';
import { assertQaPlaca } from './qa-registry';

function requireSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.VITE_SUPABASE_URL?.trim() ?? '';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
  if (!url || !anonKey) {
    throw new Error(
      'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY (defínelos en .env.qa).',
    );
  }
  return { url, anonKey };
}

export async function createQaSupabaseClient(): Promise<SupabaseClient> {
  const { url, anonKey } = requireSupabaseEnv();
  const { email, password } = requireQaCredentials();
  const client = createClient(url, anonKey);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`QA Supabase: login falló — ${error.message}`);
  }
  return client;
}

export async function resolveQaEmpresaId(client: SupabaseClient): Promise<string | null> {
  const fromEnv = process.env.VITE_EMPRESA_ID?.trim();
  if (fromEnv) return fromEnv;
  const { data: authData } = await client.auth.getUser();
  const uid = authData.user?.id;
  if (!uid) return null;
  const { data, error } = await client
    .from('user_profiles')
    .select('empresa_id')
    .eq('id', uid)
    .maybeSingle();
  if (error) return null;
  const empresaId = (data as { empresa_id?: string } | null)?.empresa_id;
  return typeof empresaId === 'string' && empresaId.trim() ? empresaId.trim() : null;
}

export type QaGastoDbVerify = {
  exists: boolean;
  id: string;
  comentarios: string | null;
  tipo_gasto: string | null;
  created_at: string | null;
};

/** Confirma que el gasto QA existe en Supabase antes de buscarlo en UI. */
export async function verifyQaGastoInSupabase(id: string, tag: string): Promise<QaGastoDbVerify> {
  const client = await createQaSupabaseClient();
  const empresaId = await resolveQaEmpresaId(client);
  let q = client
    .from('gastos')
    .select('id, comentarios, tipo_gasto, created_at')
    .eq('id', id);
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q.maybeSingle();
  if (error) {
    throw new Error(`verifyQaGastoInSupabase: ${error.message}`);
  }
  if (!data) {
    return { exists: false, id, comentarios: null, tipo_gasto: null, created_at: null };
  }
  const row = data as {
    id: string;
    comentarios?: string | null;
    tipo_gasto?: string | null;
    created_at?: string | null;
  };
  const comentarios = row.comentarios ?? null;
  if (comentarios && !comentarios.includes(QA_PREFIX)) {
    throw new Error(`Refusing verify: gasto ${id} no tiene prefijo ${QA_PREFIX}`);
  }
  if (comentarios !== tag) {
    // eslint-disable-next-line no-console
    console.warn(`[QA ROW SEARCH] comentarios BD difieren del tag UI. tag="${tag}" bd="${comentarios}"`);
  }
  return {
    exists: true,
    id: String(row.id),
    comentarios,
    tipo_gasto: row.tipo_gasto ?? null,
    created_at: row.created_at ?? null,
  };
}

export type QaGastoDbSnapshot = {
  exists: boolean;
  id: string;
  comentarios: string | null;
  monto: number | null;
  tipo_gasto: string | null;
};

/** Lee gasto QA en Supabase (sin exigir match exacto de tag). */
export async function fetchQaGastoFromSupabase(id: string): Promise<QaGastoDbSnapshot> {
  const client = await createQaSupabaseClient();
  const empresaId = await resolveQaEmpresaId(client);
  let q = client
    .from('gastos')
    .select('id, comentarios, monto, tipo_gasto')
    .eq('id', id);
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`fetchQaGastoFromSupabase: ${error.message}`);
  if (!data) {
    return { exists: false, id, comentarios: null, monto: null, tipo_gasto: null };
  }
  const row = data as {
    id: string;
    comentarios?: string | null;
    monto?: number | null;
    tipo_gasto?: string | null;
  };
  const comentarios = row.comentarios ?? null;
  if (comentarios && !comentarios.includes(QA_PREFIX)) {
    throw new Error(`Refusing fetch: gasto ${id} no tiene prefijo ${QA_PREFIX}`);
  }
  return {
    exists: true,
    id: String(row.id),
    comentarios,
    monto: typeof row.monto === 'number' ? row.monto : row.monto != null ? Number(row.monto) : null,
    tipo_gasto: row.tipo_gasto ?? null,
  };
}

/** Falla si el gasto QA sigue existiendo en Supabase. */
export async function expectQaGastoAbsentInSupabase(id: string): Promise<void> {
  const row = await fetchQaGastoFromSupabase(id);
  if (row.exists) {
    throw new Error(
      `Gasto QA id=${id} aún existe en Supabase (comentarios="${row.comentarios ?? ''}")`,
    );
  }
}

export type QaKilometrajeDbSnapshot = {
  exists: boolean;
  id: string;
  descripcion: string | null;
  kilometraje: number | null;
  kmMantenimiento: number | null;
  vehicleId: number | null;
};

export async function fetchQaKilometrajeFromSupabase(id: string): Promise<QaKilometrajeDbSnapshot> {
  const client = await createQaSupabaseClient();
  const empresaId = await resolveQaEmpresaId(client);
  let q = client
    .from('kilometrajes')
    .select('id, descripcion, kilometraje, km_mantenimiento, vehicle_id')
    .eq('id', id);
  if (empresaId) q = q.eq('empresa_id', empresaId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`fetchQaKilometrajeFromSupabase: ${error.message}`);
  if (!data) {
    return {
      exists: false,
      id,
      descripcion: null,
      kilometraje: null,
      kmMantenimiento: null,
      vehicleId: null,
    };
  }
  const row = data as {
    id: number | string;
    descripcion?: string | null;
    kilometraje?: number | null;
    km_mantenimiento?: number | null;
    vehicle_id?: number | null;
  };
  const descripcion = row.descripcion ?? null;
  if (descripcion && !descripcion.includes(QA_PREFIX)) {
    throw new Error(`Refusing fetch: kilometraje ${id} no tiene prefijo ${QA_PREFIX}`);
  }
  return {
    exists: true,
    id: String(row.id),
    descripcion,
    kilometraje: row.kilometraje != null ? Number(row.kilometraje) : null,
    kmMantenimiento: row.km_mantenimiento != null ? Number(row.km_mantenimiento) : null,
    vehicleId: row.vehicle_id != null ? Number(row.vehicle_id) : null,
  };
}

export async function expectQaKilometrajeAbsentInSupabase(id: string): Promise<void> {
  const row = await fetchQaKilometrajeFromSupabase(id);
  if (row.exists) {
    throw new Error(
      `Kilometraje QA id=${id} aún existe en Supabase (descripcion="${row.descripcion ?? ''}")`,
    );
  }
}

export type QaVehiculoCreateResult = { id: number; placa: string };

/** Inserta vehículo QA vía REST (placa QA* + modelo con [QA_AUTO]). Respeta RLS del usuario QA. */
export async function createQaVehiculoViaSupabase(opts: {
  placa: string;
  modelo: string;
  marca?: string;
}): Promise<QaVehiculoCreateResult> {
  if (!qaDbWritesEnabled()) {
    throw new Error('createQaVehiculoViaSupabase requiere QA_ALLOW_DB_WRITES=1');
  }
  assertQaPlaca(opts.placa);
  if (!opts.modelo.includes(QA_PREFIX)) {
    throw new Error(`E2E: modelo QA debe incluir ${QA_PREFIX}`);
  }

  const client = await createQaSupabaseClient();
  const empresaId = await resolveQaEmpresaId(client);
  if (!empresaId) {
    throw new Error('createQaVehiculoViaSupabase: empresa_id no disponible');
  }

  const placa = opts.placa.trim();
  const payload = {
    empresa_id: empresaId,
    marca: (opts.marca ?? 'Toyota').trim(),
    modelo: opts.modelo.trim(),
    placa,
    anio: null,
    color: null,
    activo: true,
  };

  const { data, error } = await client.from('vehiculos').insert(payload).select('id, placa').single();
  if (error) {
    throw new Error(`createQaVehiculoViaSupabase: ${error.message}`);
  }
  const row = data as { id?: number | string; placa?: string };
  if (row.id == null) {
    throw new Error('createQaVehiculoViaSupabase: insert OK pero sin id');
  }
  return { id: Number(row.id), placa: String(row.placa ?? placa) };
}
