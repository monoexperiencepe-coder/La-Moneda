const STORAGE_KEY = 'la-moneda/pendiente-revision-conciliacion';

export type ConciliacionHistorialEntry = {
  id: string;
  gastoId: string;
  monto: number;
  motivo: string;
  from_tipo_gasto: string | null;
  to_tipo_gasto: string;
  from_subtipo_gasto: string | null;
  to_subtipo_gasto: string | null;
  userLabel: string;
  at: string;
};

export type PendienteConciliacionState = {
  baselineCount: number;
  baselineMonto: number;
  sessionResolvedCount: number;
  sessionResolvedMonto: number;
  lastConciliacionAt: string | null;
  history: ConciliacionHistorialEntry[];
};

const EMPTY: PendienteConciliacionState = {
  baselineCount: 0,
  baselineMonto: 0,
  sessionResolvedCount: 0,
  sessionResolvedMonto: 0,
  lastConciliacionAt: null,
  history: [],
};

function load(): PendienteConciliacionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<PendienteConciliacionState>;
    return {
      baselineCount: Number(parsed.baselineCount) || 0,
      baselineMonto: Number(parsed.baselineMonto) || 0,
      sessionResolvedCount: Number(parsed.sessionResolvedCount) || 0,
      sessionResolvedMonto: Number(parsed.sessionResolvedMonto) || 0,
      lastConciliacionAt: typeof parsed.lastConciliacionAt === 'string' ? parsed.lastConciliacionAt : null,
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 200) : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

function save(state: PendienteConciliacionState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function getPendienteConciliacionState(): PendienteConciliacionState {
  return load();
}

/** Fija línea base de progreso si aún no existe o si creció la cola pendiente. */
export function syncPendienteBaseline(pendingCount: number, pendingMonto: number): PendienteConciliacionState {
  const cur = load();
  const next: PendienteConciliacionState = { ...cur };
  if (pendingCount > 0 && (next.baselineCount <= 0 || pendingCount > next.baselineCount)) {
    next.baselineCount = pendingCount;
    next.baselineMonto = pendingMonto;
  }
  save(next);
  return next;
}

export function recordConciliacionMove(entry: Omit<ConciliacionHistorialEntry, 'id' | 'at'>): PendienteConciliacionState {
  const cur = load();
  const row: ConciliacionHistorialEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  };
  const next: PendienteConciliacionState = {
    ...cur,
    sessionResolvedCount: cur.sessionResolvedCount + 1,
    sessionResolvedMonto: cur.sessionResolvedMonto + entry.monto,
    lastConciliacionAt: row.at,
    history: [row, ...cur.history].slice(0, 200),
  };
  save(next);
  return next;
}

export function clearConciliacionHistorial(): PendienteConciliacionState {
  const cur = load();
  const next = { ...cur, history: [] };
  save(next);
  return next;
}
