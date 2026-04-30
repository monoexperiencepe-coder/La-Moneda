/**
 * Parser de entrada rápida de texto libre para ingresos y gastos.
 *
 * Ejemplos de entrada:
 *   "50 alquiler carro 3"          → monto:50 tipo:ALQUILER vehicleId:3
 *   "alquiler 80 carro 12 dia"     → monto:80 tipo:ALQUILER subtipo:Día vehicleId:12
 *   "gasolina 30 carro 5"          → monto:30 tipo:MECÁNICOS subtipo:COMBUSTIBLE vehicleId:5
 *   "soat 200 carro 7"             → monto:200 tipo:SEGUROS/DOCUMENTOS subtipo:SOAT vehicleId:7
 *   "150"                          → monto:150 (resto sin detectar)
 *   "alquiler 50"                  → monto:50 tipo:ALQUILER
 *   "sueldos 1500 yape"            → monto:1500 tipo:GASTOS FIJOS subtipo:SUELDOS metodo:Yape
 */

import { TIPOS_INGRESO_FACT, TIPOS_GASTO_FACT } from '../data/factCatalog';
import factSubtiposIngresos from '../data/factSubtiposIngresos.json';
import factSubtiposGastos from '../data/factSubtiposGastos.json';
import type { Vehicle } from '../data/types';

export type EntryMode = 'ingreso' | 'gasto';

export interface ParsedEntry {
  monto: number | null;
  tipo: string | null;
  subTipo: string | null;
  vehicleId: number | null;
  metodoPago: string | null;
  comentarios: string;
  mode: EntryMode;
  /** Tokens no consumidos por ninguna regla (para debug / comentario) */
  restantes: string;
}

/* ──────────────────────────────────────────────────
   Alias de normalización
────────────────────────────────────────────────── */

/** Normaliza a mayúsculas sin acentos para comparar. */
function norm(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Alias palabra → tipo Fact INGRESO */
const INGRESO_ALIASES: [string[], string][] = [
  [['ALQUILER', 'ALQU', 'RENTA'], 'ALQUILER'],
  [['GARANTIA', 'GARANTIAS', 'GARAN'], 'GARANTÍAS'],
  [['APORTE', 'APORTES'], 'APORTES'],
  [['CAPITAL', 'TRABAJO'], 'CAPITAL DE TRABAJO'],
  [['DEVOLUCION', 'DEVOL', 'PRESTAMO', 'PRESTAMOS'], 'DEVOLUCION PRESTAMO'],
  [['OTROS', 'INGRESO', 'INGRESOS'], 'OTROS INGRESOS'],
];

/** Alias palabra → tipo Fact GASTO */
const GASTO_ALIASES: [string[], string][] = [
  [['GASOLINA', 'COMBUSTIBLE', 'GASOIL', 'PETROLEO', 'GAS VEHICULO'], 'MECÁNICOS'],
  [['ACEITE', 'FILTRO', 'MECANICO', 'MECANICOS', 'TALLER', 'REPARACION', 'REPUESTO',
    'MANTENIMIENTO', 'MANT', 'BATERIA', 'LLANTA', 'FRENO', 'FRENOS',
    'ALINEAMIENTO', 'SUSPENSION', 'MOTOR', 'ARREGLO'], 'MECÁNICOS'],
  [['SOAT'], 'SEGUROS /DOCUMENTOS'],
  [['REVISION', 'RT', 'RTV'], 'SEGUROS /DOCUMENTOS'],
  [['AFOCAT'], 'SEGUROS /DOCUMENTOS'],
  [['SEGURO', 'SEGUROS', 'DOCUMENTO', 'DOCUMENTOS', 'PERMISO', 'AUTORIZACION'], 'SEGUROS /DOCUMENTOS'],
  [['SUELDO', 'SUELDOS', 'SALARIO', 'GRATIFICACION', 'ALQUILER LOCAL', 'INTERES', 'INTERESES'], 'GASTOS FIJOS'],
  [['MULTA', 'PAPELETA', 'SAT', 'SUNARP', 'SUNAT', 'SUTRAN', 'NOTARIAL', 'TRAMITE',
    'TRIBUTARIO', 'MUNICIPAL', 'MUNICIPALES'], 'TRIBUTARIOS / NOTARIALES'],
  [['GNV', 'GAS NATURAL', 'GAS VEHICULO GNV'], 'GNV'],
  [['GPS', 'ACCESORIO', 'ACCESORIOS', 'EXTINTORES', 'LLANTAS'], 'ACCESORIOS'],
  [['OTROS'], 'OTROS GASTOS'],
];

/** Alias subtipo para ingresos (fragmento → subtipo Fact) */
const SUBTIPO_INGRESO_ALIASES: [string[], string][] = [
  [['DIA', 'DIAS'], 'Día'],
  [['MES'], 'Mes'],
  [['QUINCENA', 'QUINC'], 'Quincena'],
  [['SEMANA', 'SEM'], 'Semana'],
  [['TOTAL'], 'TOTAL'],
  [['PARCIAL'], 'PARCIAL'],
  [['CAPITAL'], 'Capital'],
];

/** Alias subtipo para gastos (fragmento → subtipo Fact) */
const SUBTIPO_GASTO_ALIASES: [string[], string][] = [
  [['GASOLINA', 'COMBUSTIBLE', 'PETROLEO', 'GASOIL'], 'COMBUSTIBLE'],
  [['SOAT'], 'SOAT'],
  [['RT TAXI', 'RTV TAXI', 'REVISION TAXI', 'DETAXI'], 'REVISIÓN TÉCNICA TAXI'],
  [['RT PARTICULAR', 'RTV PARTICULAR', 'REVISION PARTICULAR'], 'REVISIÓN TÉCNICA PARTICULAR'],
  [['AFOCAT'], 'AFOCAT'],
  [['SUELDO', 'SUELDOS', 'SALARIO'], 'SUELDOS'],
  [['BATERIA'], 'BATERÍA'],
  [['LLANTA', 'LLANTAS'], 'LLANTAS'],
  [['FRENO', 'FRENOS'], 'FRENOS'],
  [['ALINEAMIENTO', 'BALANCE', 'BALANCEO'], 'ALINEAMIENTO Y BALANCEO'],
  [['MANTENIMIENTO COMPLETO', 'MANT COMPLETO'], 'MANTENIMIENTO COMPLETO'],
  [['MANTENIMIENTO', 'MANT SIMPLE'], 'MANTENIMIENTO SIMPLE'],
  [['MOTOR'], 'ARREGLO MOTOR'],
  [['SAT'], 'SAT'],
  [['SUNARP'], 'SUNARP'],
  [['SUNAT'], 'SUNAT'],
  [['MULTA', 'PAPELETA'], 'PAPELETAS /MULTAS'],
  [['GRATIFICACION'], 'GRATIFICACIÓN'],
  [['INTERES', 'INTERESES'], 'INTERESES'],
  [['GPS'], 'GPS'],
];

/** Alias de método de pago */
const METODO_ALIASES: [string[], string][] = [
  [['YAPE', 'YAP'], 'Yape'],
  [['PLIN'], 'Plin'],
  [['TRANSFERENCIA', 'TRANSF', 'TRANSFER'], 'Transferencia'],
  [['EFECTIVO', 'CASH', 'EFE'], 'Efectivo'],
  [['TARJETA', 'TARJ', 'VISA', 'MC', 'MASTERCARD'], 'Tarjeta'],
];

/* ──────────────────────────────────────────────────
   Helpers de detección
────────────────────────────────────────────────── */

function matchAlias<T>(token: string, aliases: [string[], T][]): T | null {
  const n = norm(token);
  for (const [keys, val] of aliases) {
    if (keys.some((k) => n === k || n.startsWith(k) || k.startsWith(n))) return val;
  }
  return null;
}

function matchAliasMultitoken(phrase: string, aliases: [string[], string][]): string | null {
  const n = norm(phrase);
  for (const [keys, val] of aliases) {
    if (keys.some((k) => n.includes(k))) return val;
  }
  return null;
}

function findVehicleId(tokens: string[], vehicles: Vehicle[]): { vehicleId: number | null; consumed: Set<number> } {
  const consumed = new Set<number>();

  /* Patrón explícito: "carro N", "auto N", "vehiculo N", "#N" */
  const triggerWords = ['CARRO', 'AUTO', 'CAR', 'VEHICULO', 'UNIDAD', 'NUM'];
  for (let i = 0; i < tokens.length; i++) {
    const t = norm(tokens[i]);
    if (triggerWords.includes(t) && i + 1 < tokens.length) {
      const num = Number(tokens[i + 1]);
      if (Number.isFinite(num) && num > 0) {
        const v = vehicles.find((v) => v.id === num);
        if (v) {
          consumed.add(i);
          consumed.add(i + 1);
          return { vehicleId: v.id, consumed };
        }
      }
    }
    /* "#N" en el mismo token */
    if (t.startsWith('#')) {
      const num = Number(t.slice(1));
      if (Number.isFinite(num) && num > 0) {
        const v = vehicles.find((v) => v.id === num);
        if (v) {
          consumed.add(i);
          return { vehicleId: v.id, consumed };
        }
      }
    }
  }

  /* Número suelto que coincide con un vehicle.id (último candidato, baja prioridad) */
  for (let i = tokens.length - 1; i >= 0; i--) {
    const num = Number(tokens[i]);
    if (Number.isFinite(num) && Number.isInteger(num) && num > 0) {
      const v = vehicles.find((v) => v.id === num);
      if (v) {
        consumed.add(i);
        return { vehicleId: v.id, consumed };
      }
    }
  }

  return { vehicleId: null, consumed };
}

/* ──────────────────────────────────────────────────
   Función principal
────────────────────────────────────────────────── */

export function parseQuickEntry(
  raw: string,
  mode: EntryMode,
  vehicles: Vehicle[],
): ParsedEntry {
  const result: ParsedEntry = {
    monto: null,
    tipo: null,
    subTipo: null,
    vehicleId: null,
    metodoPago: null,
    comentarios: '',
    mode,
    restantes: '',
  };

  if (!raw.trim()) return result;

  const subtiposData: Record<string, string[]> =
    mode === 'ingreso'
      ? (factSubtiposIngresos as Record<string, string[]>)
      : (factSubtiposGastos as Record<string, string[]>);

  const tokens = raw.trim().split(/\s+/);
  const consumed = new Set<number>();

  /* 1) Detectar vehículo */
  const { vehicleId, consumed: vCons } = findVehicleId(tokens, vehicles);
  result.vehicleId = vehicleId;
  vCons.forEach((i) => consumed.add(i));

  /* 2) Detectar monto (primer número decimal) */
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const n = Number(tokens[i].replace(',', '.'));
    if (Number.isFinite(n) && n > 0 && !Number.isInteger(n) || (Number.isInteger(n) && n > 0 && n > 10)) {
      /* evitar confundir vehicle id pequeño con monto */
      if (vehicleId != null && n === vehicleId) continue;
      result.monto = Math.round(n * 100) / 100;
      consumed.add(i);
      break;
    }
  }
  /* Fallback: cualquier número positivo no consumido */
  if (result.monto === null) {
    for (let i = 0; i < tokens.length; i++) {
      if (consumed.has(i)) continue;
      const n = Number(tokens[i].replace(',', '.'));
      if (Number.isFinite(n) && n > 0) {
        if (vehicleId != null && n === vehicleId) continue;
        result.monto = Math.round(n * 100) / 100;
        consumed.add(i);
        break;
      }
    }
  }

  /* 3) Detectar método de pago */
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const met = matchAlias(tokens[i], METODO_ALIASES);
    if (met) {
      result.metodoPago = met;
      consumed.add(i);
      break;
    }
  }

  /* 4) Detectar tipo + subtipo con la frase completa primero (tokens sin consumir) */
  const restTokens = tokens.filter((_, i) => !consumed.has(i));
  const frase = restTokens.join(' ');

  const typeAliases = mode === 'ingreso' ? INGRESO_ALIASES : GASTO_ALIASES;
  const subAliases = mode === 'ingreso' ? SUBTIPO_INGRESO_ALIASES : SUBTIPO_GASTO_ALIASES;
  const tiposFact = mode === 'ingreso' ? TIPOS_INGRESO_FACT : TIPOS_GASTO_FACT;

  /* 4a) Intento con frase completa */
  let tipoFound = matchAliasMultitoken(frase, typeAliases);
  let subFound = matchAliasMultitoken(frase, subAliases);

  /* 4b) Si no encontró con frase, buscar token a token */
  if (!tipoFound) {
    for (let i = 0; i < tokens.length; i++) {
      if (consumed.has(i)) continue;
      const t = matchAlias(tokens[i], typeAliases);
      if (t) { tipoFound = t; consumed.add(i); break; }
    }
  }
  if (!subFound) {
    for (let i = 0; i < tokens.length; i++) {
      if (consumed.has(i)) continue;
      const s = matchAlias(tokens[i], subAliases);
      if (s) { subFound = s; consumed.add(i); break; }
    }
  }

  /* 4c) Match exacto contra tiposFact */
  if (!tipoFound) {
    const normFrase = norm(frase);
    for (const t of tiposFact) {
      if (normFrase.includes(norm(t)) || norm(t).includes(normFrase)) {
        tipoFound = t;
        break;
      }
    }
  }

  /* 4d) Validar subtipo contra el catálogo del tipo encontrado */
  if (tipoFound && subFound) {
    const validSubs = subtiposData[tipoFound] ?? [];
    const normSub = norm(subFound);
    const match = validSubs.find((s) => norm(s).includes(normSub) || normSub.includes(norm(s)));
    result.subTipo = match ?? subFound;
  } else if (subFound) {
    /* Buscar tipo por retrodeducción del subtipo */
    for (const [tipo, subs] of Object.entries(subtiposData)) {
      const normSub = norm(subFound);
      if (subs.some((s) => norm(s).includes(normSub) || normSub.includes(norm(s)))) {
        if (!tipoFound) tipoFound = tipo;
        result.subTipo = subs.find((s) => norm(s).includes(normSub) || normSub.includes(norm(s))) ?? subFound;
        break;
      }
    }
  } else if (tipoFound) {
    /* Asignar primer subtipo automáticamente */
    const subs = subtiposData[tipoFound];
    if (subs?.length) result.subTipo = subs[0];
  }

  result.tipo = tipoFound;

  /* 5) Tokens restantes → comentarios */
  const finalRest = tokens.filter((_, i) => !consumed.has(i)).join(' ').trim();
  result.restantes = finalRest;

  return result;
}

/* ──────────────────────────────────────────────────
   Preview descriptivo para mostrar al usuario
────────────────────────────────────────────────── */
export function previewParsed(p: ParsedEntry, vehicles: Vehicle[]): string {
  const parts: string[] = [];
  if (p.monto != null) parts.push(`S/ ${p.monto.toFixed(2)}`);
  if (p.tipo) parts.push(p.tipo);
  if (p.subTipo) parts.push(`· ${p.subTipo}`);
  if (p.vehicleId != null) {
    const v = vehicles.find((v) => v.id === p.vehicleId);
    parts.push(`· ${v ? `#${v.id} ${v.marca} ${v.modelo}` : `carro #${p.vehicleId}`}`);
  }
  if (p.metodoPago) parts.push(`(${p.metodoPago})`);
  return parts.join(' ') || '—';
}
