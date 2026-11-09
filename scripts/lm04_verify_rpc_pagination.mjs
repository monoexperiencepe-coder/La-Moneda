/** Verifica que paginación .range recupera vehículos id 195/196 en RPC. */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const PAGE = 1000;
function load(n) {
  const p = resolve('.', n);
  if (!existsSync(p)) return {};
  const o = {};
  for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = l.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    o[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return o;
}

const e = { ...load('.env'), ...load('.env.local') };
const s = createClient(e.VITE_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const emp = e.VITE_EMPRESA_ID;

async function page(from, to) {
  const { data, error } = await s.rpc('fetch_latest_control_fechas_by_vehicle', { p_empresa_id: emp }).range(from, to);
  return { data: data ?? [], error: error?.message ?? null };
}

const p0 = await page(0, PAGE - 1);
const p1 = await page(PAGE, PAGE * 2 - 1);
const all = [...p0.data, ...p1.data];
const ids = new Set([195, 196]);
const found = all.filter((r) => ids.has(r.vehicle_id));
const keys = new Set();
let duplicates = 0;
for (const r of all) {
  const k = `${r.vehicle_id}|${r.tipo}`;
  if (keys.has(k)) duplicates += 1;
  keys.add(k);
}

console.log(
  JSON.stringify(
    {
      page0: p0.data.length,
      page1: p1.data.length,
      totalMerged: all.length,
      uniquePairs: keys.size,
      duplicates,
      lastPageShort: p1.data.length < PAGE,
      found195_196: found.map((r) => ({ vehicle_id: r.vehicle_id, tipo: r.tipo, fecha: r.fecha_vencimiento })),
      pass: found.some((r) => r.vehicle_id === 196 && r.tipo === 'RT_PARTICULAR'),
    },
    null,
    2,
  ),
);
