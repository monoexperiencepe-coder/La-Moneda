import type { Gasto } from '../data/types';
import type {
  ClasificacionMemoriaMatchInfo,
  ClasificacionMemoriaRow,
  ClasificacionSugerenciaFuente,
} from '../modules/ai/clasificacionMemoriaTypes';
import {
  findBestClasificacionMemoriaMatch,
  MEMORIA_MATCH_STRONG_SCORE,
} from './clasificacionMemoriaMatch';
import {
  buildClasificacionMemoriaTextoOriginal,
  normalizeClasificacionMemoryText,
} from './clasificacionMemoriaText';
import { normKey } from './subtipoFinancieroLabel';
import { fetchClasificacionMemoriaActivas, incrementarMemoriaUsada } from '../services/ai/clasificacionMemoriaService';

export type ClasificacionSugerencia = {
  tipo_gasto: string;
  subtipo_gasto: string;
  razon: string;
};

export type ClasificacionSugerenciaCompleta = {
  tipo_gasto_sugerido: string | null;
  subtipo_sugerido: string | null;
  razon: string;
  confianza: number;
  necesita_revision_humana: boolean;
  fuente: ClasificacionSugerenciaFuente;
  memoria_match: ClasificacionMemoriaMatchInfo | null;
};

export type ClasificacionGastoInput = {
  motivo?: string | null;
  comentarios?: string | null;
  monto?: number | null;
  vehicleId?: number | null;
  subtipo_gasto?: string | null;
  tipo_gasto?: string | null;
  tipo?: string | null;
  subTipo?: string | null;
  placa?: string | null;
};

export type SugerenciaClasificacionOpts = {
  memoria?: ClasificacionMemoriaRow[];
  /** Si true, incrementa veces_usado en BD (solo en flujos async con empresa). */
  trackMemoriaUso?: boolean;
};

function buildTextoFromInput(input: ClasificacionGastoInput): string {
  return buildClasificacionMemoriaTextoOriginal([
    input.motivo,
    input.comentarios,
    input.placa,
    input.tipo,
    input.subTipo,
    input.subtipo_gasto,
    input.tipo_gasto,
  ]);
}

function textoGasto(g: Gasto): string {
  return buildClasificacionMemoriaTextoOriginal([
    g.motivo,
    g.comentarios,
    g.tipo,
    g.subTipo,
    g.subtipo_gasto,
    g.categoria,
    g.categoriaReal,
    g.subcategoria,
  ]);
}

type Regla = {
  test: (t: string) => boolean;
  sug: ClasificacionSugerencia;
};

const REGLAS: Regla[] = [
  {
    test: (t) => /\b(arrancador|alternador|motor\s+de\s+arranque)\b/.test(t),
    sug: {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'arrancador',
      razon: 'Menciona pieza mecánica (arrancador/alternador) + contexto vehículo',
    },
  },
  {
    test: (t) => /\b(sat|multa|tramite|tramites|papeleta|infraccion)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'multas_tramites', razon: 'Texto tipo SAT / multas / trámites' },
  },
  {
    test: (t) => /\b(soat|afocat|seguro\s+vehicular|poliza)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'documentos', razon: 'Texto tipo SOAT / documentos vehículo' },
  },
  {
    test: (t) => /\b(aceite|lubricante|filtro\s+aceite|cambio\s+aceite)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'motor', razon: 'Texto tipo aceite / motor' },
  },
  {
    test: (t) => /\b(llanta|llantas|rodaje|neumatico|goma)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'llantas', razon: 'Texto tipo llantas' },
  },
  {
    test: (t) => /\b(freno|frenos|pastilla|disco\s+freno)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'frenos', razon: 'Texto tipo frenos' },
  },
  {
    test: (t) => /\b(gasolina|grifo|petroleo|diesel|combustible)\b/.test(t) && !/\b(gnv|glp)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'combustible', razon: 'Texto tipo gasolina / combustible' },
  },
  {
    test: (t) =>
      /\b(tubo\s+escape|linea\s+escape|l[ií]nea\s+escape|silenciador|mofle|escape\s+vehicular|sistema\s+escape)\b/.test(t)
      || (/\bescape\b/.test(t) && !/\bescapar/.test(t)),
    sug: {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'arreglo_linea_escape',
      razon: 'Texto tipo línea de escape / silenciador / mofle',
    },
  },
  {
    test: (t) => /\b(autoparte|autopartes|repuesto|repuestos|pieza|faro|parachoques?|espejo)\b/.test(t),
    sug: {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'autopartes',
      razon: 'Texto tipo autoparte / repuesto / pieza vehicular',
    },
  },
  {
    test: (t) => /\baccesorios?\b/.test(t),
    sug: {
      tipo_gasto: 'operativo_vehiculo',
      subtipo_gasto: 'autopartes',
      razon: 'Texto tipo accesorios vehiculares',
    },
  },
  {
    test: (t) => /\b(prestamo|prestamos|interes|banco|cuota|credito|financier)\b/.test(t),
    sug: { tipo_gasto: 'financiero_prestamo', subtipo_gasto: 'prestamo', razon: 'Texto tipo préstamo / financiero' },
  },
  {
    test: (t) => /\b(planilla|sueldo|gratificacion|cts|essalud\s+laboral)\b/.test(t),
    sug: { tipo_gasto: 'planilla_laboral', subtipo_gasto: 'planilla', razon: 'Texto tipo planilla laboral' },
  },
  {
    test: (t) => /\b(compra\s+activo|inversion|inversi[oó]n|compra\s+carro|compra\s+vehiculo|compra\s+unidad)\b/.test(t),
    sug: { tipo_gasto: 'inversion_compra', subtipo_gasto: 'inversion_compra', razon: 'Texto tipo inversión / compra activo' },
  },
  {
    test: (t) => /\b(almuerzo|cena|representacion|socio|reunion)\b/.test(t),
    sug: {
      tipo_gasto: 'representacion_interna',
      subtipo_gasto: 'gasto_representacion',
      razon: 'Texto tipo representación / socios',
    },
  },
  {
    test: (t) => /\b(sunat|notarial|tributari|oficina|administrativ)\b/.test(t),
    sug: {
      tipo_gasto: 'administrativo_empresa',
      subtipo_gasto: 'administrativo_general',
      razon: 'Texto tipo administrativo / tributario',
    },
  },
  {
    test: (t) => /\b(bateria|baterias|acumulador)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'motor', razon: 'Texto tipo batería' },
  },
  {
    test: (t) => /\b(gnv|gas\s+natural|certificado\s+gnv|quinquenal)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'combustible', razon: 'Texto tipo GNV' },
  },
  {
    test: (t) => /\b(glp|gas\s+licuado)\b/.test(t) && !/\bgnv\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'combustible', razon: 'Texto tipo GLP' },
  },
  {
    test: (t) => /\b(soat|afocat|brevete|licencia\s+conducir|atu|permiso\s+atu)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'documentos', razon: 'Texto tipo SOAT / documentos / ATU' },
  },
  {
    test: (t) => /\b(gps|rastreo|chip|telemetria)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'gps', razon: 'Texto tipo GPS / chip' },
  },
  {
    test: (t) => /\b(mantenimiento|service|reparacion|taller|mecanico)\b/.test(t) && !/\b(repuesto|autoparte|pieza)\b/.test(t),
    sug: { tipo_gasto: 'operativo_vehiculo', subtipo_gasto: 'motor', razon: 'Texto tipo mantenimiento / reparación' },
  },
  {
    test: (t) => /\b(global|flota\s+general|sin\s+vehiculo)\b/.test(t) && !/\bvehiculo\s+\d+\b/.test(t),
    sug: { tipo_gasto: 'gastos_globales', subtipo_gasto: 'gasto_global', razon: 'Texto sugiere gasto global' },
  },
];

function sugerirDesdeTextoNormalizado(t: string): ClasificacionSugerencia | null {
  if (!t) return null;
  for (const r of REGLAS) {
    if (r.test(t)) return r.sug;
  }
  return null;
}

function confianzaHeuristica(
  sug: ClasificacionSugerencia | null,
  texto: string,
  tieneVehiculo?: boolean,
): ClasificacionSugerenciaCompleta {
  if (!sug) {
    return {
      tipo_gasto_sugerido: null,
      subtipo_sugerido: null,
      razon: 'Sin coincidencia clara en reglas locales. Revisar manualmente o dar más contexto.',
      confianza: 0.25,
      necesita_revision_humana: true,
      fuente: 'heuristica',
      memoria_match: null,
    };
  }
  const ambiguo = /\b(otro|varios|misc|pendiente|revisar|sin\s+clasificar)\b/.test(texto);
  const piezaVehiculo =
    sug.tipo_gasto === 'operativo_vehiculo' &&
    tieneVehiculo &&
    /\b(arrancador|alternador|repuesto|autoparte|pieza|motor|freno|llanta|bateria|escape|mofle|faro|espejo)\b/.test(texto);
  let confianza = ambiguo ? 0.55 : piezaVehiculo ? 0.91 : 0.85;
  if (tieneVehiculo && sug.tipo_gasto === 'operativo_vehiculo' && !ambiguo && confianza < 0.88) {
    confianza = 0.88;
  }
  return {
    tipo_gasto_sugerido: sug.tipo_gasto,
    subtipo_sugerido: sug.subtipo_gasto,
    razon: sug.razon,
    confianza,
    necesita_revision_humana: ambiguo,
    fuente: 'heuristica',
    memoria_match: null,
  };
}

function confianzaDesdeMemoria(score: number, confirmaciones: number): number {
  let c = score >= 0.9 ? 0.93 : score >= MEMORIA_MATCH_STRONG_SCORE ? 0.9 : 0.82;
  c += Math.min(0.05, confirmaciones * 0.01);
  return Math.min(0.97, c);
}

function sugerirDesdeMemoria(
  textoOriginal: string,
  textoNorm: string,
  memoria: ClasificacionMemoriaRow[],
  opts?: SugerenciaClasificacionOpts,
): ClasificacionSugerenciaCompleta | null {
  const match = findBestClasificacionMemoriaMatch(textoOriginal || textoNorm, memoria);
  if (!match) return null;

  if (opts?.trackMemoriaUso) {
    void incrementarMemoriaUsada(match.row.id);
  }

  const memoriaMatch: ClasificacionMemoriaMatchInfo = {
    texto_relacionado: match.row.texto_original,
    score: match.score,
    veces_confirmado: match.row.veces_confirmado,
    memoria_id: match.row.id,
  };

  return {
    tipo_gasto_sugerido: match.row.tipo_gasto_final,
    subtipo_sugerido: match.row.subtipo_final,
    razon: `Patrón aprendido del historial humano (${Math.round(match.score * 100)}% similitud, ${match.row.veces_confirmado} confirmaciones)`,
    confianza: confianzaDesdeMemoria(match.score, match.row.veces_confirmado),
    necesita_revision_humana: match.score < MEMORIA_MATCH_STRONG_SCORE,
    fuente: 'memoria_humana',
    memoria_match: memoriaMatch,
  };
}

function combinarMemoriaYHeuristica(
  mem: ClasificacionSugerenciaCompleta,
  heur: ClasificacionSugerenciaCompleta,
): ClasificacionSugerenciaCompleta {
  const mismoTipo = mem.tipo_gasto_sugerido === heur.tipo_gasto_sugerido;
  const mismoSub = mem.subtipo_sugerido === heur.subtipo_sugerido;
  if (mismoTipo && mismoSub) {
    return {
      ...mem,
      fuente: 'mixto',
      confianza: Math.min(0.97, Math.max(mem.confianza, heur.confianza) + 0.03),
      razon: `${mem.razon} · Coincide con reglas locales.`,
      necesita_revision_humana: mem.necesita_revision_humana && heur.necesita_revision_humana,
    };
  }
  if (mem.confianza >= heur.confianza + 0.05) return mem;
  return {
    ...heur,
    fuente: 'mixto',
    memoria_match: mem.memoria_match,
    razon: `${heur.razon} · Memoria humana sugiere ${mem.tipo_gasto_sugerido}/${mem.subtipo_sugerido} (${Math.round((mem.memoria_match?.score ?? 0) * 100)}%).`,
    confianza: Math.max(heur.confianza, mem.confianza * 0.95),
  };
}

/** Sugerencia completa: memoria humana primero, luego heurísticas. */
export function sugerirClasificacionGastoCompleta(
  input: ClasificacionGastoInput | string,
  opts?: SugerenciaClasificacionOpts,
): ClasificacionSugerenciaCompleta {
  const textoOriginal = typeof input === 'string' ? input.trim() : buildTextoFromInput(input);
  const textoNorm =
    typeof input === 'string' ? normalizeClasificacionMemoryText(input) : normalizeClasificacionMemoryText(textoOriginal);
  const textoReglas = typeof input === 'string' ? normKey(input) : normKey(textoOriginal);
  const tieneVehiculo =
    typeof input !== 'string' && input.vehicleId != null && Number.isFinite(Number(input.vehicleId));

  const memoria = opts?.memoria ?? [];
  const desdeMemoria = memoria.length > 0 ? sugerirDesdeMemoria(textoOriginal, textoNorm, memoria, opts) : null;
  const heur = confianzaHeuristica(sugerirDesdeTextoNormalizado(textoReglas), textoReglas, tieneVehiculo);

  if (desdeMemoria && heur.tipo_gasto_sugerido) {
    return combinarMemoriaYHeuristica(desdeMemoria, heur);
  }
  if (desdeMemoria) return desdeMemoria;
  return heur;
}

/** Igual que completa pero carga memoria de la empresa (async). */
export async function sugerirClasificacionGastoCompletaAsync(
  input: ClasificacionGastoInput | string,
  tenantEmpresaId?: string | null,
): Promise<ClasificacionSugerenciaCompleta> {
  const memoria = await fetchClasificacionMemoriaActivas(tenantEmpresaId);
  return sugerirClasificacionGastoCompleta(input, { memoria, trackMemoriaUso: true });
}

/** Heurística por texto libre (sin memoria). */
export function sugerirClasificacionGastoTexto(texto: string): ClasificacionSugerencia | null {
  return sugerirDesdeTextoNormalizado(normKey(texto));
}

/** Heurística local (sin memoria). No aplica cambios; solo sugiere. */
export function sugerirClasificacionGasto(g: Gasto): ClasificacionSugerencia | null {
  return sugerirDesdeTextoNormalizado(textoGasto(g));
}

export function sugerirClasificacionGastoFromGasto(
  g: Gasto,
  opts?: SugerenciaClasificacionOpts,
): ClasificacionSugerenciaCompleta {
  return sugerirClasificacionGastoCompleta(
    {
      motivo: g.motivo,
      comentarios: g.comentarios,
      monto: g.monto,
      vehicleId:
        typeof g.vehicleId === 'number'
          ? g.vehicleId
          : typeof g.vehicleId === 'string' && g.vehicleId.trim()
            ? Number(g.vehicleId) || null
            : null,
      subtipo_gasto: g.subtipo_gasto,
      tipo_gasto: g.tipo_gasto,
      tipo: g.tipo,
      subTipo: g.subTipo,
    },
    opts,
  );
}

export async function sugerirClasificacionGastoFromGastoAsync(
  g: Gasto,
  tenantEmpresaId?: string | null,
): Promise<ClasificacionSugerenciaCompleta> {
  const memoria = await fetchClasificacionMemoriaActivas(tenantEmpresaId);
  return sugerirClasificacionGastoFromGasto(g, { memoria, trackMemoriaUso: true });
}
