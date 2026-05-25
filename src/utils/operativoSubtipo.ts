import { normKey } from './subtipoFinancieroLabel';

export const OPERATIVO_SUBTIPO_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'motor', label: 'Motor' },
  { value: 'bateria', label: 'Batería' },
  { value: 'gps_chips', label: 'GPS / chips' },
  { value: 'combustible', label: 'Combustible' },
  { value: 'documentos', label: 'Documentos / SOAT' },
  { value: 'multas_tramites', label: 'Multas y trámites' },
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'accesorios', label: 'Accesorios' },
  { value: 'arreglo_linea_escape', label: 'Arreglo línea de escape' },
  { value: 'autopartes', label: 'Autopartes' },
  { value: 'llantas', label: 'Llantas' },
  { value: 'frenos', label: 'Frenos' },
  { value: 'suspension', label: 'Suspensión' },
  { value: 'electricidad', label: 'Electricidad' },
  { value: 'gnv', label: 'GNV' },
  { value: 'aire_acondicionado', label: 'Aire acondicionado' },
  { value: 'interior', label: 'Interior' },
  { value: 'impuesto_vehicular', label: 'Impuesto vehicular' },
  { value: 'planchado_pintura', label: 'Planchado / pintura' },
  { value: 'otros_operativo', label: 'Otros operativo' },
] as const;

const CANON_SET = new Set(OPERATIVO_SUBTIPO_OPTIONS.map((o) => o.value));

/** Tipo Fact + subtipo Fact por defecto para KPI / importación (metadata operativa). */
const FACT_DEFAULT_BY_CANON: Record<string, { tipo: string; subTipo: string }> = {
  motor: { tipo: 'MECÁNICOS', subTipo: 'ARREGLO MOTOR' },
  bateria: { tipo: 'MECÁNICOS', subTipo: 'Batería' },
  gps_chips: { tipo: 'ACCESORIOS', subTipo: 'CHIPS TELEFONÍA' },
  combustible: { tipo: 'MECÁNICOS', subTipo: 'COMBUSTIBLE' },
  documentos: { tipo: 'DOCUMENTOS', subTipo: 'SOAT' },
  multas_tramites: { tipo: 'DOCUMENTOS', subTipo: 'PERMISOS VARIOS' },
  mantenimiento: { tipo: 'MECÁNICOS', subTipo: 'MANTENIMIENTO COMPLETO' },
  accesorios: { tipo: 'ACCESORIOS', subTipo: 'OTROS /ESPECIFICAR' },
  arreglo_linea_escape: { tipo: 'MECÁNICOS', subTipo: 'OTROS /ESPECIFICAR' },
  autopartes: { tipo: 'ACCESORIOS', subTipo: 'AUTOPARTE' },
  llantas: { tipo: 'ACCESORIOS', subTipo: 'LLANTAS' },
  frenos: { tipo: 'MECÁNICOS', subTipo: 'FRENOS' },
  suspension: { tipo: 'MECÁNICOS', subTipo: 'DIRECCIÓN Y SUSPENSIÓN' },
  electricidad: { tipo: 'MECÁNICOS', subTipo: 'ARREGLO ELECTRINICO' },
  gnv: { tipo: 'GNV', subTipo: 'MANTENIKIENTO' },
  aire_acondicionado: { tipo: 'MECÁNICOS', subTipo: 'AIRE CONDICIONADO' },
  interior: { tipo: 'IMPLEMENTACIÓN', subTipo: 'FORROS Y FUNDAS' },
  impuesto_vehicular: { tipo: 'DOCUMENTOS', subTipo: 'PERMISOS VARIOS' },
  planchado_pintura: { tipo: 'MECÁNICOS', subTipo: 'OTROS /ESPECIFICAR' },
  otros_operativo: { tipo: 'MECÁNICOS', subTipo: 'OTROS /ESPECIFICAR' },
};

/** normKey(Fact subtipo string) → canónico */
const NORM_FACT_SUBTIPO_TO_CANON: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  const add = (factSub: string, canon: string) => {
    m[normKey(factSub)] = canon;
  };
  add('ARREGLO MOTOR', 'motor');
  add('MOTOR', 'motor');
  add('Batería', 'bateria');
  add('CHIPS TELEFONÍA', 'gps_chips');
  add('GPS', 'gps_chips');
  add('COMBUSTIBLE', 'combustible');
  add('GASOLINA', 'combustible');
  add('GLP', 'combustible');
  add('GNV', 'gnv');
  add('SOAT', 'documentos');
  add('AFOCAT', 'documentos');
  add('RT-PARTICULAR', 'multas_tramites');
  add('RT-TAXI', 'multas_tramites');
  add('PERMISOS VARIOS', 'multas_tramites');
  add('VIGENCIA DE PODER', 'documentos');
  add('MANTENIMIENTO COMPLETO', 'mantenimiento');
  add('MANTENIMIENTO SIMPLE', 'mantenimiento');
  add('MANTENIKIENTO', 'mantenimiento');
  add('ALINEAMIENTO Y BALANCEO', 'mantenimiento');
  add('LLANTAS', 'llantas');
  add('FRENOS', 'frenos');
  add('DIRECCIÓN Y SUSPENSIÓN', 'suspension');
  add('ARREGLO ELECTRINICO', 'electricidad');
  add('AIRE CONDICIONADO', 'aire_acondicionado');
  add('BOTIQUÍN', 'accesorios');
  add('EQUIPOS DE SONIDO', 'accesorios');
  add('EXTINTORES', 'accesorios');
  add('RECARGAS', 'accesorios');
  add('AUTOPARTE', 'autopartes');
  add('AUTOPARTES', 'autopartes');
  add('REPUESTOS', 'autopartes');
  add('REPUESTO', 'autopartes');
  add('FORROS Y FUNDAS', 'interior');
  add('OTROS /ESPECIFICAR', 'otros_operativo');
  add('CIA DE SEGUROS', 'documentos');
  add('REVISIÓN TÉCNICA PARTICULAR', 'multas_tramites');
  add('REVISIÓN TÉCNICA TAXI', 'multas_tramites');
  add('PAPELETAS /MULTAS', 'multas_tramites');
  add('AUTORIZACIÓN ATU', 'multas_tramites');
  add('PERMISO POLARIZADO', 'multas_tramites');
  return m;
})();

function squash(s: string): string {
  return normKey(s).replace(/[\s\-_/]+/g, '_').replace(/_+/g, '_');
}

/**
 * Devuelve el código canónico si el texto encaja en el universo operativo; si no, null.
 * No agrupa “desconocido” aquí (eso lo hace `resolveOperativoSubtipoGastoCanon` en UI).
 */
export function normalizeOperativoSubtipo(raw: string | null | undefined): string | null {
  const s0 = (raw ?? '').trim();
  if (!s0) return null;
  const squ = squash(s0);
  if (CANON_SET.has(squ)) return squ;
  const k = normKey(s0);
  if (CANON_SET.has(k)) return k;

  const fromFact = NORM_FACT_SUBTIPO_TO_CANON[k];
  if (fromFact) return fromFact;

  const nk = normKey(s0.replace(/_/g, ' '));
  if (nk.includes('bater')) return 'bateria';
  if (nk.includes('chip') || nk.includes('gps') || nk === 'chips') return 'gps_chips';
  if (nk.includes('combust') || nk.includes('gasolin') || nk.includes('diesel') || nk.includes('abastec')) {
    return 'combustible';
  }
  /* Multas, papeletas, SUNAT/SAT, trámites y permisos (antes de documentos SOAT e impuesto vehicular). */
  if (
    squ === 'multas_permisos_tramites'
    || nk.includes('multas_permisos_tramites')
    || nk.includes('multas permisos tramites')
    || nk.includes('documentos vehiculares')
    || nk.includes('tramites vehiculares')
    || nk.includes('tramite vehicular')
    || nk.includes('tramites legales')
    || nk.includes('tramite legal')
    || nk.includes('permiso municipal')
    || nk.includes('permisos municipales')
    || nk.includes('multa')
    || nk.includes('papeleta')
    || nk.includes('sunat')
    || nk === 'sat'
    || nk.startsWith('sat ')
    || nk.endsWith(' sat')
    || nk.includes(' sat ')
    || nk.includes('revision tecnica')
    || nk.includes('revisiones')
    || nk.includes('brevete')
    || nk === 'licencia'
    || nk.startsWith('licencia ')
    || nk.includes(' licencia ')
    || nk.includes('licencia de conducir')
    || (nk.includes('permiso') && nk.includes('vehicular'))
    || (nk.includes('tramite') && nk.includes('vehicular'))
    || nk === 'permisos'
    || nk === 'permiso'
    || nk === 'tramites'
    || nk === 'tramite'
    || (nk.includes('tramite') && nk.includes('legal'))
  ) {
    return 'multas_tramites';
  }
  if (nk.includes('soat') || nk.includes('afocat')) {
    return 'documentos';
  }
  if (nk.includes('manten')) return 'mantenimiento';
  if (nk.includes('llant')) return 'llantas';
  if (nk.includes('fren')) return 'frenos';
  if (nk.includes('suspens') || nk.includes('direccion')) return 'suspension';
  if (nk.includes('electr')) return 'electricidad';
  if (nk.includes('gnv') || nk.includes('glp')) return nk.includes('gnv') ? 'gnv' : 'combustible';
  if (nk.includes('aire') && nk.includes('acond')) return 'aire_acondicionado';
  if (nk.includes('motor') || nk.includes('arreglo motor')) return 'motor';
  if (nk.includes('impuesto') || nk.includes('vehicular')) return 'impuesto_vehicular';
  if (nk.includes('planchad') || nk.includes('pintur')) return 'planchado_pintura';
  if (
    nk.includes('linea escape')
    || nk.includes('linea de escape')
    || nk.includes('tubo escape')
    || nk.includes('silenciador')
    || nk.includes('mofle')
    || (nk.includes('escape') && !nk.includes('escapar'))
  ) {
    return 'arreglo_linea_escape';
  }
  if (
    nk.includes('autoparte')
    || nk.includes('repuesto')
    || nk.includes('pieza')
    || nk.includes('faro')
    || nk.includes('parachoque')
    || nk.includes('espejo')
  ) {
    return 'autopartes';
  }
  if (nk.includes('forro') || nk.includes('funda') || nk.includes('interior')) return 'interior';
  if (nk.includes('accesor') || nk.includes('sonido')) {
    return 'accesorios';
  }
  if (nk.includes('seguro') && nk.includes('document')) return 'documentos';

  const legacy = normKey(s0);
  if (legacy === 'interior') return 'interior';
  if (legacy === 'gnv') return 'gnv';

  return null;
}

/** Para UI/filtros en pestaña operativos: siempre devuelve un bucket (otros si no hay match). */
export function resolveOperativoSubtipoGastoCanon(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  return normalizeOperativoSubtipo(t) ?? 'otros_operativo';
}

export function getOperativoSubtipoLabel(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '—';
  const row = OPERATIVO_SUBTIPO_OPTIONS.find((o) => o.value === v);
  if (row) return row.label;
  const n = normalizeOperativoSubtipo(v);
  if (n) {
    const r2 = OPERATIVO_SUBTIPO_OPTIONS.find((o) => o.value === n);
    if (r2) return r2.label;
  }
  return v;
}

export function getOperativoSubtipoOptions(): { value: string; label: string }[] {
  return [...OPERATIVO_SUBTIPO_OPTIONS];
}

export function getDefaultFactTipoSubtipoForOperativoCanon(canon: string): { tipo: string; subTipo: string } {
  return FACT_DEFAULT_BY_CANON[canon] ?? FACT_DEFAULT_BY_CANON.otros_operativo;
}

export function getOperativoCanonSet(): Set<string> {
  return new Set(CANON_SET);
}
