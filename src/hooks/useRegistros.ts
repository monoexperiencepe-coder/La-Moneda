import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  Ingreso,
  Gasto,
  Descuento,
  Prestamo,
  PrestamoAbono,
  UnidadRegistro,
  Conductor,
  ControlFecha,
  KilometrajeRegistro,
  Pendiente,
  RegistroTiempo,
  Mantenimiento,
  Documentacion,
  Vehicle,
  InversionVehiculo,
  GastoCaja,
  CajaNegocioVehiculo,
} from '../data/types';
import {
  deleteVehiculo,
  fetchVehiculos,
  insertVehiculo,
  patchVehiculo,
  type InsertVehiculoInput,
} from '../services/vehiculosService';
import { fetchUnidades, insertUnidad, removeUnidad } from '../services/unidadesService';
import {
  fetchConductores,
  insertConductor,
  patchConductor,
  removeConductor,
} from '../services/conductoresService';
import {
  assignConductorToVehicle as runFleetAssignment,
  unassignVehiculoConductor,
  type FleetAssignmentResult,
} from '../services/fleetAssignmentService';
import { fetchIngresos, insertIngreso, removeIngreso } from '../services/ingresosService';
import {
  fetchGastosByTipo,
  fetchGastosFinancialSummary,
  fetchGastosFull,
  fetchGastosRecent,
  insertGasto,
  mergeGastosUniqueById,
  removeGasto,
} from '../services/gastosService';
import type { GastosFinancialSummary } from '../utils/gastosFinancialSummary';
import {
  fetchLatestControlFechasByVehicle,
  fetchControlFechasHistoryPage,
  getDefaultControlFechasHistoryPageSize,
  insertControlFecha,
  patchControlFecha,
  removeControlFecha,
  type ControlFechasHistoryFilters,
} from '../services/controlFechasService';
import { fetchKilometrajes, insertKilometraje, removeKilometraje } from '../services/kilometrajesService';
import {
  fetchPendientes,
  insertPendiente,
  patchPendiente,
  removePendiente,
} from '../services/pendientesService';
import {
  fetchRegistrosTiempo,
  insertRegistroTiempo,
  patchRegistroTiempo,
  removeRegistroTiempo,
} from '../services/registrosTiempoService';
import { fetchInversionesVehiculo } from '../services/inversionesVehiculoService';
import { fetchGastosCaja } from '../services/gastosCajaService';
import { fetchCajaNegocioVehiculo } from '../services/cajaNegocioService';
import { enrichGastoOperativo, enrichIngresoOperativo } from '../utils/registroOperativo';
import { sortRegistrosByLatestCreatedOrDate } from '../utils/sortRegistrosByLatestCreatedOrDate';
import { useAuth } from '../context/AuthContext';
import { canUseIngresos, canUseInversiones, isFinancialOperadorRestricted, isOperadorVisibleTipoGasto, permissionUserFromAuth } from '../utils/permissions';
import {
  type ApplyGastoLocalOpts,
  type GastoHistorialSyncEvent,
  type GastoMovedLocalOptions,
  devLogGastoLocalMutation,
  patchSummaryAddGasto,
  patchSummaryForGastoMove,
  patchSummaryRemoveGasto,
} from '../utils/gastoLocalMutations';
import { enrichGastoHistorialActivity } from '../utils/gastoHistorialOrder';

function normalizeIngresoMoneda(ingreso: Omit<Ingreso, 'id' | 'createdAt'>): Omit<Ingreso, 'id' | 'createdAt'> {
  const moneda = ingreso.moneda ?? 'PEN';
  const tipoCambio = ingreso.tipoCambio ?? null;
  const montoPENReferencia =
    ingreso.montoPENReferencia != null
      ? ingreso.montoPENReferencia
      : moneda === 'USD' && tipoCambio != null && tipoCambio > 0
        ? Number((ingreso.monto * tipoCambio).toFixed(2))
        : ingreso.monto;
  return { ...ingreso, moneda, tipoCambio, montoPENReferencia };
}

/** Tras alta/edición local: más reciente arriba (created_at → fecha_registro → fecha → id). */
function mergeIngresoSorted(prev: Ingreso[], row: Ingreso): Ingreso[] {
  const without = prev.some((x) => x.id === row.id) ? prev.filter((x) => x.id !== row.id) : prev;
  const next = [...without, row];
  next.sort(sortRegistrosByLatestCreatedOrDate);
  return next;
}

function mergeGastoSorted(prev: Gasto[], row: Gasto): Gasto[] {
  const without = prev.some((x) => String(x.id) === String(row.id))
    ? prev.filter((x) => String(x.id) !== String(row.id))
    : prev;
  const next = [...without, row];
  next.sort(sortRegistrosByLatestCreatedOrDate);
  return next;
}

/** Mismo orden que fetchUnidades: id desc (string / uuid). */
function mergeUnidadSorted(prev: UnidadRegistro[], row: UnidadRegistro): UnidadRegistro[] {
  const without = prev.some((x) => x.id === row.id) ? prev.filter((x) => x.id !== row.id) : prev;
  const next = [...without, row];
  next.sort((a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
  return next;
}

function mergeConductorSorted(prev: Conductor[], row: Conductor): Conductor[] {
  const without = prev.some((x) => x.id === row.id) ? prev.filter((x) => x.id !== row.id) : prev;
  const next = [...without, row];
  next.sort((a, b) => String(b.id).localeCompare(String(a.id)));
  return next;
}

function applyFleetAssignmentPatches(
  setConductores: Dispatch<SetStateAction<Conductor[]>>,
  rows: readonly Conductor[],
): void {
  if (rows.length === 0) return;
  setConductores((prev) => {
    let next = prev;
    for (const row of rows) {
      next = mergeConductorSorted(next, row);
    }
    return next;
  });
}

function mergeKilometrajeSorted(prev: KilometrajeRegistro[], row: KilometrajeRegistro): KilometrajeRegistro[] {
  const without = prev.some((x) => x.id === row.id) ? prev.filter((x) => x.id !== row.id) : prev;
  const next = [...without, row];
  next.sort((a, b) => {
    const fd = b.fecha.localeCompare(a.fecha);
    if (fd !== 0) return fd;
    return b.id - a.id;
  });
  return next;
}

function mergePendienteSorted(prev: Pendiente[], row: Pendiente): Pendiente[] {
  const without = prev.some((x) => x.id === row.id) ? prev.filter((x) => x.id !== row.id) : prev;
  const next = [...without, row];
  next.sort((a, b) => {
    const fd = b.fecha.localeCompare(a.fecha);
    if (fd !== 0) return fd;
    return b.id - a.id;
  });
  return next;
}

function mergeRegistroTiempoSorted(prev: RegistroTiempo[], row: RegistroTiempo): RegistroTiempo[] {
  const without = prev.some((x) => x.id === row.id) ? prev.filter((x) => x.id !== row.id) : prev;
  const next = [...without, row];
  next.sort((a, b) => {
    const fd = b.fecha.localeCompare(a.fecha);
    if (fd !== 0) return fd;
    return b.id - a.id;
  });
  return next;
}

function mergeVehicleSorted(prev: Vehicle[], row: Vehicle): Vehicle[] {
  const without = prev.some((x) => x.id === row.id) ? prev.filter((x) => x.id !== row.id) : prev;
  return [...without, row].sort((a, b) => a.id - b.id);
}

function mergeInversionVehiculoSorted(prev: InversionVehiculo[], row: InversionVehiculo): InversionVehiculo[] {
  const without = prev.some((x) => x.id === row.id) ? prev.filter((x) => x.id !== row.id) : prev;
  return [...without, row].sort((a, b) => a.id - b.id);
}

function mergeGastoCajaSorted(prev: GastoCaja[], row: GastoCaja): GastoCaja[] {
  const without = prev.some((x) => x.id === row.id) ? prev.filter((x) => x.id !== row.id) : prev;
  const next = [...without, row];
  next.sort((a, b) => {
    const fd = b.fecha.localeCompare(a.fecha);
    if (fd !== 0) return fd;
    return b.id - a.id;
  });
  return next;
}

function mergeCajaNegocioSorted(prev: CajaNegocioVehiculo[], row: CajaNegocioVehiculo): CajaNegocioVehiculo[] {
  const without = prev.some((x) => x.id === row.id) ? prev.filter((x) => x.id !== row.id) : prev;
  const next = [...without, row];
  next.sort((a, b) => {
    const fd = b.fecha.localeCompare(a.fecha);
    if (fd !== 0) return fd;
    return b.id - a.id;
  });
  return next;
}

export const useRegistros = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [mantenimientos, setMantenimientos] = useState<Mantenimiento[]>([]);
  const [documentaciones, setDocumentaciones] = useState<Documentacion[]>([]);
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [prestamoAbonos, setPrestamoAbonos] = useState<PrestamoAbono[]>([]);
  const [unidades, setUnidades] = useState<UnidadRegistro[]>([]);
  const [conductores, setConductores] = useState<Conductor[]>([]);
  const [controlFechas, setControlFechas] = useState<ControlFecha[]>([]);
  const [controlFechasHistory, setControlFechasHistory] = useState<ControlFecha[]>([]);
  const [controlFechasHistoryTotal, setControlFechasHistoryTotal] = useState<number | null>(null);
  const [controlFechasHistoryPage, setControlFechasHistoryPage] = useState(0);
  const [controlFechasHistoryLoading, setControlFechasHistoryLoading] = useState(false);
  const historyQueryRef = useRef<{ filters: ControlFechasHistoryFilters; page: number } | null>(null);
  const historyPageSize = getDefaultControlFechasHistoryPageSize();

  const [kilometrajes, setKilometrajes] = useState<KilometrajeRegistro[]>([]);
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [registrosTiempo, setRegistrosTiempo] = useState<RegistroTiempo[]>([]);
  const [inversionesVehiculo, setInversionesVehiculo] = useState<InversionVehiculo[]>([]);
  const [gastosCaja, setGastosCaja] = useState<GastoCaja[]>([]);
  const [cajaNegocioVehiculo, setCajaNegocioVehiculo] = useState<CajaNegocioVehiculo[]>([]);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const sessionUserIdRef = useRef<string | null>(null);
  const gastosLoadGenRef = useRef(0);
  const gastosAuditRef = useRef(gastos);
  gastosAuditRef.current = gastos;
  const ingresosAuditRef = useRef(ingresos);
  ingresosAuditRef.current = ingresos;
  const cajaNegocioAuditRef = useRef(cajaNegocioVehiculo);
  cajaNegocioAuditRef.current = cajaNegocioVehiculo;
  const gastosCajaAuditRef = useRef(gastosCaja);
  gastosCajaAuditRef.current = gastosCaja;
  const descuentosAuditRef = useRef(descuentos);
  descuentosAuditRef.current = descuentos;
  const permissionUserAuditRef = useRef<ReturnType<typeof permissionUserFromAuth> | null>(null);
  const { isAuthenticated, profile, user } = useAuth();

  const [isLoadingGastos, setIsLoadingGastos] = useState(false);
  const [hasLoadedGastosOnce, setHasLoadedGastosOnce] = useState(false);
  const [gastosLoadScope, setGastosLoadScope] = useState<'recent' | 'full'>('recent');
  const [isLoadingGastosFull, setIsLoadingGastosFull] = useState(false);
  const gastosLoadScopeRef = useRef(gastosLoadScope);
  gastosLoadScopeRef.current = gastosLoadScope;
  const empresaIdAuditRef = useRef<string | null>(profile?.empresa_id ?? null);
  empresaIdAuditRef.current = profile?.empresa_id ?? null;
  const [gastosFinancialSummary, setGastosFinancialSummary] = useState<GastosFinancialSummary | null>(null);
  const [isLoadingGastosSummary, setIsLoadingGastosSummary] = useState(false);
  const reloadGastosSummaryRef = useRef<(opts?: { silent?: boolean }) => Promise<void>>(async () => {});
  const historialSyncListenersRef = useRef(new Set<(event: GastoHistorialSyncEvent) => void>());
  const removedGastoIdsRef = useRef(new Set<string>());
  const lastReloadDeletedGastoIdRef = useRef<string | null>(null);
  const summaryReconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [registrosRemoteTick, setRegistrosRemoteTick] = useState(0);

  const bumpRegistrosRemoteSync = useCallback(() => {
    setRegistrosRemoteTick((n) => n + 1);
  }, []);

  /** Vacía datos tenant/financieros al cerrar sesión o cambiar de usuario (evita mezclar operador ↔ admin). */
  const clearFinancialRegistrosState = useCallback(() => {
    gastosLoadGenRef.current += 1;
    setIsLoadingGastos(false);
    setHasLoadedGastosOnce(false);
    setGastosLoadScope('recent');
    setIsLoadingGastosFull(false);
    setGastosFinancialSummary(null);
    setIsLoadingGastosSummary(false);
    setIngresos([]);
    setGastos([]);
    setInversionesVehiculo([]);
    setGastosCaja([]);
    setCajaNegocioVehiculo([]);
    historyQueryRef.current = null;
    setControlFechasHistory([]);
    setControlFechasHistoryTotal(null);
    setControlFechasHistoryPage(0);
    setControlFechasHistoryLoading(false);
  }, []);

  const permissionUser = useMemo(
    () => (profile ? permissionUserFromAuth(user, profile.email) : null),
    [user, profile],
  );
  permissionUserAuditRef.current = permissionUser;

  const canLoadIngresos = useMemo(() => canUseIngresos(permissionUser), [permissionUser]);

  const canLoadInversionesCaja = useMemo(() => canUseInversiones(permissionUser), [permissionUser]);

  useEffect(() => {
    if (!isAuthenticated) {
      clearFinancialRegistrosState();
      sessionUserIdRef.current = null;
      return;
    }
    const uid = profile?.id ?? null;
    if (!uid) return;
    if (sessionUserIdRef.current !== null && sessionUserIdRef.current !== uid) {
      clearFinancialRegistrosState();
    }
    sessionUserIdRef.current = uid;
  }, [isAuthenticated, profile?.id, clearFinancialRegistrosState]);

  /**
   * Tras login / sesión restaurada: `false` hasta terminar refresh + margen mínimo UI.
   * Con sesión cerrada: `true` (no bloquea overlay).
   */
  const [registrosBootstrapComplete, setRegistrosBootstrapComplete] = useState(true);
  const [registrosBootstrapLoading, setRegistrosBootstrapLoading] = useState(false);
  const [registrosBootstrapStarted, setRegistrosBootstrapStarted] = useState(false);

  const loadControlFechasHistory = useCallback(async (filters: ControlFechasHistoryFilters, page: number) => {
    historyQueryRef.current = { filters, page };
    setControlFechasHistoryLoading(true);
    try {
      let p = Math.max(0, page);
      for (;;) {
        const { rows, total } = await fetchControlFechasHistoryPage(
          filters,
          p,
          historyPageSize,
          profile?.empresa_id,
        );
        if (rows.length > 0 || p === 0) {
          historyQueryRef.current = { filters, page: p };
          setControlFechasHistory(rows);
          setControlFechasHistoryTotal(total);
          setControlFechasHistoryPage(p);
          break;
        }
        p -= 1;
      }
    } finally {
      setControlFechasHistoryLoading(false);
    }
  }, [historyPageSize, profile?.empresa_id]);

  /** RPC resumen + re-paginar historial si el usuario lo tenía abierto (sin refresh global). */
  const refreshControlFechasViews = useCallback(async () => {
    const latest = await fetchLatestControlFechasByVehicle(profile?.empresa_id);
    setControlFechas(latest);
    const q = historyQueryRef.current;
    if (q) await loadControlFechasHistory(q.filters, q.page);
  }, [loadControlFechasHistory, profile?.empresa_id]);

  const removeControlFechaLocal = useCallback((id: number) => {
    setControlFechas((prev) => prev.filter((c) => c.id !== id));
    setControlFechasHistory((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (next.length !== prev.length) {
        setControlFechasHistoryTotal((t) => (t != null ? Math.max(0, t - 1) : t));
      }
      return next;
    });
  }, []);

  /** Bootstrap: recientes + tipos críticos completos (pendiente, globales). */
  const loadGastosBootstrap = useCallback(async (): Promise<Gasto[]> => {
    gastosLoadGenRef.current += 1;
    const gen = gastosLoadGenRef.current;
    setIsLoadingGastos(true);
    try {
      if (!profile?.empresa_id) {
        if (gen === gastosLoadGenRef.current) {
          setGastos([]);
          setHasLoadedGastosOnce(true);
          setGastosLoadScope('recent');
        }
        return [];
      }
      const [recent, pendiente, globales] = await Promise.all([
        fetchGastosRecent(profile.empresa_id),
        fetchGastosByTipo('pendiente_revision', profile.empresa_id),
        fetchGastosByTipo('gastos_globales', profile.empresa_id),
      ]);
      const merged = mergeGastosUniqueById(recent, pendiente, globales);
      if (gen === gastosLoadGenRef.current) {
        setGastos(merged);
        setHasLoadedGastosOnce(true);
        setGastosLoadScope('recent');
      }
      return merged;
    } finally {
      if (gen === gastosLoadGenRef.current) {
        setIsLoadingGastos(false);
      }
    }
  }, [profile?.empresa_id]);

  /** Histórico completo bajo demanda (reportes, conciliación total). */
  const loadGastosFullFromSupabase = useCallback(async (): Promise<Gasto[]> => {
    gastosLoadGenRef.current += 1;
    const gen = gastosLoadGenRef.current;
    setIsLoadingGastosFull(true);
    setIsLoadingGastos(true);
    try {
      if (!profile?.empresa_id) {
        if (gen === gastosLoadGenRef.current) {
          setGastos([]);
          setHasLoadedGastosOnce(true);
          setGastosLoadScope('full');
        }
        return [];
      }
      const g = await fetchGastosFull(profile.empresa_id);
      if (gen === gastosLoadGenRef.current) {
        setGastos(g);
        setHasLoadedGastosOnce(true);
        setGastosLoadScope('full');
      }
      return g;
    } finally {
      if (gen === gastosLoadGenRef.current) {
        setIsLoadingGastos(false);
        setIsLoadingGastosFull(false);
      }
    }
  }, [profile?.empresa_id]);

  /** @deprecated Alias interno — bootstrap reciente. */
  const loadGastosFromSupabase = loadGastosBootstrap;

  /** Agregados financieros globales (RPC; no trae filas). `silent` evita spinner de summary. */
  const reloadGastosFinancialSummary = useCallback(async (opts?: { silent?: boolean }) => {
    if (!profile?.empresa_id) {
      setGastosFinancialSummary(null);
      return;
    }
    if (!opts?.silent) setIsLoadingGastosSummary(true);
    try {
      const summary = await fetchGastosFinancialSummary(profile.empresa_id);
      setGastosFinancialSummary(summary);
      if (import.meta.env.DEV) {
        console.log('[summary-context]', summary);
      }
    } finally {
      if (!opts?.silent) setIsLoadingGastosSummary(false);
    }
  }, [profile?.empresa_id]);

  reloadGastosSummaryRef.current = reloadGastosFinancialSummary;

  const includeTipoInSummaryPatch = useCallback(
    (tipo: string | null | undefined) => {
      if (!permissionUser || !isFinancialOperadorRestricted(permissionUser)) return true;
      return isOperadorVisibleTipoGasto(tipo);
    },
    [permissionUser],
  );

  const notifyGastoHistorialSync = useCallback((event: GastoHistorialSyncEvent) => {
    historialSyncListenersRef.current.forEach((fn) => {
      try {
        fn(event);
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[localMutation:gasto] historial listener error', e);
      }
    });
  }, []);

  const subscribeGastoHistorialSync = useCallback((listener: (event: GastoHistorialSyncEvent) => void) => {
    historialSyncListenersRef.current.add(listener);
    return () => {
      historialSyncListenersRef.current.delete(listener);
    };
  }, []);

  const scheduleSummaryReconcile = useCallback((opts?: { silent?: boolean }) => {
    if (summaryReconcileTimerRef.current) clearTimeout(summaryReconcileTimerRef.current);
    summaryReconcileTimerRef.current = setTimeout(() => {
      summaryReconcileTimerRef.current = null;
      void reloadGastosSummaryRef.current({ silent: true, ...opts });
    }, 900);
  }, []);

  const patchFinancialSummary = useCallback(
    (
      patcher: (summary: GastosFinancialSummary) => GastosFinancialSummary,
      opts?: ApplyGastoLocalOpts,
    ) => {
      if (opts?.optimisticSummary === false) return;
      setGastosFinancialSummary((prev) => {
        if (!prev) return prev;
        const next = patcher(prev);
        if (import.meta.env.DEV) {
          devLogGastoLocalMutation('updated', {
            action: 'summary-patch',
            source: opts?.source,
            totalBefore: prev.totalGastos,
            totalAfter: next.totalGastos,
          });
        }
        return next;
      });
    },
    [],
  );

  const applyGastoCreatedLocal = useCallback(
    (gasto: Gasto, opts?: ApplyGastoLocalOpts) => {
      const active = enrichGastoHistorialActivity(gasto);
      setGastos((prev) => mergeGastoSorted(prev, active));
      patchFinancialSummary(
        (s) => patchSummaryAddGasto(s, active, (t) => includeTipoInSummaryPatch(t)),
        opts,
      );
      notifyGastoHistorialSync({ kind: 'created', gasto: active });
      devLogGastoLocalMutation('created', {
        id: active.id,
        tipo_gasto: active.tipo_gasto,
        monto: gasto.monto,
        source: opts?.source,
        updatedSummary: opts?.optimisticSummary !== false,
      });
      if (opts?.reloadSummary !== false) scheduleSummaryReconcile();
    },
    [includeTipoInSummaryPatch, notifyGastoHistorialSync, patchFinancialSummary, scheduleSummaryReconcile],
  );

  const applyGastoRemovedLocal = useCallback(
    (id: string, before?: Gasto | null, opts?: ApplyGastoLocalOpts) => {
      const sid = String(id);
      removedGastoIdsRef.current.add(sid);
      lastReloadDeletedGastoIdRef.current = sid;
      let snapshot = before ?? null;
      setGastos((prev) => {
        if (!snapshot) snapshot = prev.find((g) => String(g.id) === sid) ?? null;
        return prev.filter((g) => String(g.id) !== sid);
      });
      setCajaNegocioVehiculo((prev) =>
        prev.filter((r) => String(r.origenGastoId ?? '') !== sid),
      );
      if (snapshot) {
        patchFinancialSummary(
          (s) => patchSummaryRemoveGasto(s, snapshot!, (t) => includeTipoInSummaryPatch(t)),
          opts,
        );
      }
      notifyGastoHistorialSync({ kind: 'removed', id: sid, before: snapshot });
      devLogGastoLocalMutation('removed', {
        id: sid,
        fromTipo: snapshot?.tipo_gasto,
        deltaMonto: snapshot ? -snapshot.monto : 0,
        source: opts?.source,
        updatedSummary: opts?.optimisticSummary !== false && !!snapshot,
      });
      if (opts?.reloadSummary !== false) scheduleSummaryReconcile();
    },
    [includeTipoInSummaryPatch, notifyGastoHistorialSync, patchFinancialSummary, scheduleSummaryReconcile],
  );

  const filterGastosExcludingRemoved = useCallback((rows: Gasto[]): Gasto[] => {
    const tombstones = removedGastoIdsRef.current;
    if (tombstones.size === 0) return rows;
    return rows.filter((g) => !tombstones.has(String(g.id)));
  }, []);

  const purgeRemovedGastoTombstones = useCallback((freshRows: Gasto[]) => {
    const freshIds = new Set(freshRows.map((g) => String(g.id)));
    for (const id of removedGastoIdsRef.current) {
      if (!freshIds.has(id)) removedGastoIdsRef.current.delete(id);
    }
  }, []);

  const applyGastoUpdatedLocal = useCallback(
    (before: Gasto, after: Gasto, opts?: ApplyGastoLocalOpts) => {
      setGastos((prev) => mergeGastoSorted(prev, after));
      const tipoChanged = before.tipo_gasto !== after.tipo_gasto;
      const montoChanged = before.monto !== after.monto;
      if (tipoChanged || montoChanged) {
        patchFinancialSummary(
          (s) => patchSummaryForGastoMove(s, before, after, (t) => includeTipoInSummaryPatch(t)),
          opts,
        );
      }
      notifyGastoHistorialSync({ kind: 'updated', before, after });
      devLogGastoLocalMutation('updated', {
        id: after.id,
        fromTipo: before.tipo_gasto,
        toTipo: after.tipo_gasto,
        deltaMonto: after.monto - before.monto,
        source: opts?.source,
      });
      if (opts?.reloadSummary !== false) scheduleSummaryReconcile();
    },
    [includeTipoInSummaryPatch, notifyGastoHistorialSync, patchFinancialSummary, scheduleSummaryReconcile],
  );

  const applyGastoMovedLocal = useCallback(
    (before: Gasto, after: Gasto, options?: GastoMovedLocalOptions) => {
      const movedOut = options?.movedOutOfView === true || options?.removeFromVisible === true;
      if (movedOut) {
        setGastos((prev) => prev.filter((g) => String(g.id) !== String(before.id)));
      } else {
        setGastos((prev) => mergeGastoSorted(prev, after));
      }
      patchFinancialSummary(
        (s) => patchSummaryForGastoMove(s, before, movedOut ? null : after, (t) => includeTipoInSummaryPatch(t)),
        options,
      );
      notifyGastoHistorialSync({
        kind: 'moved',
        before,
        after,
        movedOutOfView: movedOut,
        removeFromVisible: movedOut,
      });
      devLogGastoLocalMutation('moved', {
        id: before.id,
        fromTipo: before.tipo_gasto,
        toTipo: after.tipo_gasto,
        deltaMonto: before.monto,
        movedOut,
        source: options?.source,
        updatedSummary: options?.optimisticSummary !== false,
      });
      if (options?.reloadSummary !== false) scheduleSummaryReconcile();
    },
    [includeTipoInSummaryPatch, notifyGastoHistorialSync, patchFinancialSummary, scheduleSummaryReconcile],
  );

  /** Recarga bootstrap (recientes + tipos críticos) + summary BD. */
  const reloadGastosOnly = useCallback(async () => {
    const checkDeletedId = lastReloadDeletedGastoIdRef.current;
    const rows = await loadGastosBootstrap();
    await reloadGastosFinancialSummary({ silent: true });
    purgeRemovedGastoTombstones(rows);
    console.warn('[reloadGastosOnly:done]', {
      rows: rows.length,
      containsDeletedId: checkDeletedId
        ? rows.some((g) => String(g.id) === checkDeletedId)
        : undefined,
      checkDeletedId,
    });
    if (checkDeletedId && !rows.some((g) => String(g.id) === checkDeletedId)) {
      lastReloadDeletedGastoIdRef.current = null;
    }
  }, [loadGastosBootstrap, purgeRemovedGastoTombstones, reloadGastosFinancialSummary]);

  const reloadGastosFull = useCallback(async () => {
    await loadGastosFullFromSupabase();
  }, [loadGastosFullFromSupabase]);

  /** Solo `ingresos` desde Supabase (operador / operador@: lista vacía, sin fetch). */
  const reloadIngresosOnly = useCallback(async () => {
    if (!canLoadIngresos) {
      setIngresos([]);
      return;
    }
    const rows = await fetchIngresos(profile?.empresa_id);
    setIngresos(rows);
  }, [canLoadIngresos, profile?.empresa_id]);

  /** Solo kilometrajes. */
  const reloadKilometrajesOnly = useCallback(async () => {
    const km = await fetchKilometrajes(profile?.empresa_id);
    setKilometrajes(km);
  }, [profile?.empresa_id]);

  /** Solo pendientes. */
  const reloadPendientesOnly = useCallback(async () => {
    const pen = await fetchPendientes(profile?.empresa_id);
    setPendientes(pen);
  }, [profile?.empresa_id]);

  /** Resumen RPC de controles + historial si estaba abierto (sin refresh global). */
  const reloadControlFechasLatest = useCallback(async () => {
    await refreshControlFechasViews();
  }, [refreshControlFechasViews]);

  const refreshFromSupabase = useCallback(async () => {
    if (refreshInFlightRef.current) {
      await refreshInFlightRef.current;
      return;
    }
    const runner = (async () => {
      const dev = import.meta.env.DEV;
      const bootT0 = dev ? performance.now() : 0;
      if (dev) console.time('[perf] bootstrap.refreshFromSupabase');

      const parallelT0 = dev ? performance.now() : 0;
      const [v, u, c, i, g, gSummary, latest, km, pen, rt, inv, cn] = await Promise.all([
        fetchVehiculos(profile?.empresa_id),
        fetchUnidades(profile?.empresa_id),
        fetchConductores(profile?.empresa_id),
        canLoadIngresos ? fetchIngresos(profile?.empresa_id) : Promise.resolve([] as Ingreso[]),
        loadGastosBootstrap(),
        fetchGastosFinancialSummary(profile?.empresa_id),
        fetchLatestControlFechasByVehicle(profile?.empresa_id),
        fetchKilometrajes(profile?.empresa_id),
        fetchPendientes(profile?.empresa_id),
        fetchRegistrosTiempo(profile?.empresa_id),
        canLoadInversionesCaja
          ? fetchInversionesVehiculo(profile?.empresa_id)
          : Promise.resolve([] as InversionVehiculo[]),
        canLoadInversionesCaja
          ? fetchCajaNegocioVehiculo(profile?.empresa_id)
          : Promise.resolve([] as CajaNegocioVehiculo[]),
      ]);

      if (dev) {
        console.info('[perf] bootstrap.parallel batch', {
          ms: Math.round(performance.now() - parallelT0),
          vehicles: v.length,
          unidades: u.length,
          conductores: c.length,
          ingresos: i.length,
          gastos: g.length,
          gastosSummaryTotal: gSummary?.totalGastos ?? null,
          controlFechas: latest.length,
          kilometrajes: km.length,
          pendientes: pen.length,
          registrosTiempo: rt.length,
          inversionesVehiculo: inv.length,
          cajaNegocioVehiculo: cn.length,
        });
      }
      setVehicles(v);
      setUnidades(u);
      setConductores(c);
      if (dev) {
        void import('../audit/techAuditDiagnostics').then(({ auditVehiculos, auditConductores, auditFlotaSummary }) => {
          auditVehiculos(v);
          auditConductores(c, v);
          auditFlotaSummary(v, c);
        });
      }
      setIngresos(canLoadIngresos ? i : []);
      setGastosFinancialSummary(gSummary);
      if (import.meta.env.DEV) {
        console.log('[summary-context] bootstrap', gSummary);
      }
      setControlFechas(latest);
      setKilometrajes(km);
      setPendientes(pen);
      setRegistrosTiempo(rt);
      setInversionesVehiculo(canLoadInversionesCaja ? inv : []);
      setCajaNegocioVehiculo(canLoadInversionesCaja ? cn : []);

      // `gastos_caja` es histórico y no bloquea la percepción inicial en home.
      if (canLoadInversionesCaja) {
        void fetchGastosCaja(profile?.empresa_id)
          .then((gc) => {
            setGastosCaja(gc);
            if (dev) {
              console.info('[perf] bootstrap.fetchGastosCaja (async)', { rows: gc.length });
            }
          })
          .catch((e) => {
            console.error('[useRegistros refreshFromSupabase fetchGastosCaja]', e);
          });
      } else {
        setGastosCaja([]);
      }

      const q = historyQueryRef.current;
      if (q) {
        await loadControlFechasHistory(q.filters, q.page);
      }

      if (dev) {
        console.timeEnd('[perf] bootstrap.refreshFromSupabase');
        console.info('[perf] bootstrap.refreshFromSupabase total', {
          ms: Math.round(performance.now() - bootT0),
          gastos: g.length,
        });
      }
    })();
    refreshInFlightRef.current = runner;
    try {
      await runner;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, [loadControlFechasHistory, profile?.empresa_id, canLoadIngresos, canLoadInversionesCaja, loadGastosBootstrap]);

  /**
   * Sin sesión: listo (no overlay). Con sesión: incompleto antes de pintar el dashboard,
   * para evitar un frame sin overlay tras login.
   */
  useLayoutEffect(() => {
    if (!isAuthenticated) {
      setRegistrosBootstrapComplete(true);
      setRegistrosBootstrapLoading(false);
      setRegistrosBootstrapStarted(false);
      setHasLoadedGastosOnce(false);
      setIsLoadingGastos(false);
    } else {
      setRegistrosBootstrapComplete(false);
      setRegistrosBootstrapLoading(true);
      setRegistrosBootstrapStarted(true);
      setHasLoadedGastosOnce(false);
    }
  }, [isAuthenticated]);

  /** Con sesión: refresh real (incl. gastos) + mínimo breve anti-parpadeo; sin timeout que oculte carga lenta. */
  useEffect(() => {
    if (!isAuthenticated) return;

    let canceled = false;
    const t0 = performance.now();
    const MIN_MS = 600;
    const dev = import.meta.env.DEV;
    if (dev) console.time('[perf] bootstrap.total');

    void refreshFromSupabase()
      .catch(() => {
        /* errores ya logueados en servicios */
      })
      .finally(() => {
        if (canceled) return;
        const wait = Math.max(0, MIN_MS - (performance.now() - t0));
        window.setTimeout(() => {
          if (canceled) return;
          setRegistrosBootstrapLoading(false);
          setRegistrosBootstrapComplete(true);
          setRegistrosBootstrapStarted(false);
          if (dev) {
            console.timeEnd('[perf] bootstrap.total');
            console.info('[perf] bootstrap.total', {
              ms: Math.round(performance.now() - t0),
              minUiWaitMs: wait,
            });
          }
        }, wait);
      });

    return () => {
      canceled = true;
    };
  }, [isAuthenticated, refreshFromSupabase]);

  /** Si el bootstrap no trajo summary (perfil tardío o RPC falló), reintentar al tener empresa_id. */
  useEffect(() => {
    if (!isAuthenticated || !profile?.empresa_id) return;
    if (gastosFinancialSummary != null) return;
    void reloadGastosFinancialSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al resolver empresa_id
  }, [isAuthenticated, profile?.empresa_id]);

  const addIngreso = useCallback(
    async (ingreso: Omit<Ingreso, 'id' | 'createdAt'>) => {
      const esExtra = ingreso.esExtraordinario === true || ingreso.vehicleId == null;
      const v =
        !esExtra && ingreso.vehicleId != null
          ? vehicles.find((x) => x.id === ingreso.vehicleId)
          : undefined;
      const detalleDelAuto = v ? `${v.marca} ${v.modelo} — ${v.placa}` : null;
      const norm = normalizeIngresoMoneda({
        ...ingreso,
        vehicleId: esExtra ? null : ingreso.vehicleId,
        esExtraordinario: esExtra,
        ...enrichIngresoOperativo({
          comentarios: ingreso.comentarios,
          tipo: ingreso.tipo,
          subTipo: ingreso.subTipo,
          detalleDelAuto,
        }),
        estadoPago: 'PAGADO',
      });
      const created = await insertIngreso(norm, profile?.empresa_id);
      if (!created) throw new Error('No se pudo guardar el ingreso en Supabase.');
      setIngresos((prev) => mergeIngresoSorted(prev, created));
      return created;
    },
    [vehicles, profile?.empresa_id],
  );

  const addGasto = useCallback(
    async (gasto: Omit<Gasto, 'id' | 'createdAt'>) => {
      const v =
        gasto.vehicleId != null ? vehicles.find((x) => x.id === gasto.vehicleId) : undefined;
      const detalleDelAuto = v ? `${v.marca} ${v.modelo} — ${v.placa}` : null;
      const row = {
        ...gasto,
        ...enrichGastoOperativo({
          comentarios: gasto.comentarios,
          tipo: gasto.tipo,
          subTipo: gasto.subTipo,
          detalleDelAuto,
          categoriaExcelRaw: null,
        }),
      };
      const created = await insertGasto(row, profile?.empresa_id);
      if (!created) throw new Error('No se pudo guardar el gasto en Supabase.');
      applyGastoCreatedLocal(created, { source: 'user', reloadSummary: false });
      scheduleSummaryReconcile();
      return created;
    },
    [vehicles, profile?.empresa_id, applyGastoCreatedLocal, scheduleSummaryReconcile],
  );

  const addMantenimiento = useCallback((mant: Omit<Mantenimiento, 'id' | 'createdAt'>) => {
    const newMant: Mantenimiento = {
      ...mant,
      id: Date.now(),
      createdAt: new Date().toISOString(),
    };
    setMantenimientos((prev) => [newMant, ...prev]);
    return newMant;
  }, []);

  const addDocumentacion = useCallback((doc: Omit<Documentacion, 'id' | 'createdAt'>) => {
    const newDoc: Documentacion = {
      ...doc,
      id: Date.now(),
      createdAt: new Date().toISOString(),
    };
    setDocumentaciones((prev) => [newDoc, ...prev]);
    return newDoc;
  }, []);

  const addDescuento = useCallback((row: Omit<Descuento, 'id' | 'createdAt'>) => {
    const newRow: Descuento = {
      ...row,
      id: Date.now(),
      createdAt: new Date().toISOString(),
    };
    setDescuentos((prev) => [newRow, ...prev]);
    return newRow;
  }, []);

  const addPrestamo = useCallback((row: Omit<Prestamo, 'id' | 'createdAt'>) => {
    const newRow: Prestamo = {
      ...row,
      id: Date.now(),
      createdAt: new Date().toISOString(),
    };
    setPrestamos((prev) => [newRow, ...prev]);
    return newRow;
  }, []);

  const addUnidad = useCallback(
    async (row: Omit<UnidadRegistro, 'id' | 'createdAt'>) => {
      const created = await insertUnidad(row, profile?.empresa_id);
      if (!created) throw new Error('No se pudo guardar la unidad en Supabase.');
      setUnidades((prev) => mergeUnidadSorted(prev, created));
      return created;
    },
    [profile?.empresa_id],
  );

  const addConductor = useCallback(
    async (row: Omit<Conductor, 'id' | 'createdAt'>) => {
      const created = await insertConductor(row, profile?.empresa_id);
      if (!created) throw new Error('No se pudo guardar el conductor en Supabase.');
      setConductores((prev) => mergeConductorSorted(prev, created));
      return created;
    },
    [profile?.empresa_id],
  );

  const addVehicle = useCallback(
    async (row: InsertVehiculoInput, opts?: { conductorId?: string | null }) => {
      const created = await insertVehiculo(row, profile?.empresa_id);
      if (!created) throw new Error('No se pudo guardar el vehículo en Supabase.');
      setVehicles((prev) => mergeVehicleSorted(prev, created));

      const conductorId = opts?.conductorId?.trim();
      if (conductorId) {
        const { updatedConductores } = await runFleetAssignment(
          conductorId,
          created.id,
          conductores,
          profile?.empresa_id,
        );
        applyFleetAssignmentPatches(setConductores, updatedConductores);
      }

      return created;
    },
    [profile?.empresa_id, conductores],
  );

  const updateVehicle = useCallback(
    async (id: number, patch: Partial<Omit<Vehicle, 'id'>>): Promise<Vehicle | null> => {
      const updated = await patchVehiculo(id, patch, profile?.empresa_id);
      if (!updated) return null;
      setVehicles((prev) => mergeVehicleSorted(prev, updated));
      return updated;
    },
    [profile?.empresa_id],
  );

  const deleteVehicle = useCallback(
    async (id: number) => {
      let prevSnapshot: Vehicle[] = [];
      setVehicles((prev) => {
        prevSnapshot = prev;
        return prev.filter((v) => v.id !== id);
      });
      const ok = await deleteVehiculo(id, profile?.empresa_id);
      if (!ok) {
        setVehicles(prevSnapshot);
        throw new Error('No se pudo eliminar el vehículo.');
      }
    },
    [profile?.empresa_id],
  );

  const addControlFecha = useCallback(
    async (row: Omit<ControlFecha, 'id' | 'createdAt'>) => {
      const created = await insertControlFecha(row, profile?.empresa_id);
      if (!created) throw new Error('No se pudo guardar el control de fecha en Supabase.');
      await refreshControlFechasViews();
      return created;
    },
    [refreshControlFechasViews, profile?.empresa_id],
  );

  const updateControlFecha = useCallback(
    async (id: number, patch: Partial<Omit<ControlFecha, 'id' | 'createdAt'>>): Promise<ControlFecha | null> => {
      const updated = await patchControlFecha(id, patch, profile?.empresa_id);
      if (!updated) return null;
      await refreshControlFechasViews();
      return updated;
    },
    [refreshControlFechasViews, profile?.empresa_id],
  );

  const addKilometraje = useCallback(
    async (row: Omit<KilometrajeRegistro, 'id' | 'createdAt'>) => {
      const created = await insertKilometraje(row, profile?.empresa_id);
      if (!created) throw new Error('No se pudo guardar el kilometraje en Supabase.');
      setKilometrajes((prev) => {
        const next = mergeKilometrajeSorted(prev, created);
        if (import.meta.env.DEV) {
          void import('../audit/techAuditDiagnostics').then(({ logKmAfterCreate, logKmSummaryRefresh }) => {
            logKmAfterCreate(created, next);
            logKmSummaryRefresh(created.vehicleId, next);
          });
        }
        return next;
      });
      return created;
    },
    [profile?.empresa_id],
  );

  const addPendiente = useCallback(
    async (row: Omit<Pendiente, 'id' | 'createdAt'>) => {
      const creator =
        profile?.id && user?.name
          ? { id: profile.id, name: user.name }
          : profile?.id
            ? { id: profile.id, name: profile.name || profile.email }
            : null;
      const created = await insertPendiente(row, profile?.empresa_id, creator);
      if (!created) {
        throw new Error(
          'No se pudo guardar el pendiente en Supabase. Revisa la consola: si faltan columnas (titulo, metadata), ejecuta supabase/migration_pendientes_redesign_apply.sql en el SQL Editor.',
        );
      }
      setPendientes((prev) => mergePendienteSorted(prev, created));
      return created;
    },
    [profile?.empresa_id, profile?.id, profile?.name, profile?.email, user?.name],
  );

  const updatePendiente = useCallback(
    async (id: number, patch: Partial<Omit<Pendiente, 'id' | 'createdAt'>>): Promise<Pendiente | null> => {
      const updated = await patchPendiente(id, patch, profile?.empresa_id);
      if (!updated) return null;
      setPendientes((prev) => mergePendienteSorted(prev, updated));
      return updated;
    },
    [profile?.empresa_id],
  );

  const deletePendiente = useCallback(
    async (id: number) => {
      let prevSnapshot: Pendiente[] = [];
      setPendientes((prev) => {
        prevSnapshot = prev;
        return prev.filter((p) => p.id !== id);
      });
      const ok = await removePendiente(id, profile?.empresa_id);
      if (!ok) {
        setPendientes(prevSnapshot);
        throw new Error('No se pudo eliminar el pendiente.');
      }
    },
    [profile?.empresa_id],
  );

  const addRegistroTiempo = useCallback(
    async (row: Omit<RegistroTiempo, 'id' | 'createdAt'>) => {
      const created = await insertRegistroTiempo(row, profile?.empresa_id);
      if (!created) throw new Error('No se pudo guardar el registro de tiempo en Supabase.');
      setRegistrosTiempo((prev) => mergeRegistroTiempoSorted(prev, created));
      return created;
    },
    [profile?.empresa_id],
  );

  const updateRegistroTiempo = useCallback(
    async (id: number, patch: Partial<Omit<RegistroTiempo, 'id' | 'createdAt'>>): Promise<RegistroTiempo | null> => {
      const updated = await patchRegistroTiempo(id, patch, profile?.empresa_id);
      if (!updated) return null;
      setRegistrosTiempo((prev) => mergeRegistroTiempoSorted(prev, updated));
      return updated;
    },
    [profile?.empresa_id],
  );

  const deleteRegistroTiempo = useCallback(
    async (id: number) => {
      let prevSnapshot: RegistroTiempo[] = [];
      setRegistrosTiempo((prev) => {
        prevSnapshot = prev;
        return prev.filter((r) => r.id !== id);
      });
      const ok = await removeRegistroTiempo(id, profile?.empresa_id);
      if (!ok) {
        setRegistrosTiempo(prevSnapshot);
        throw new Error('No se pudo eliminar el registro de tiempo.');
      }
    },
    [profile?.empresa_id],
  );

  const addPrestamoAbono = useCallback((abono: Omit<PrestamoAbono, 'id' | 'createdAt'>) => {
    let newAb: PrestamoAbono | null = null;
    setPrestamos((prev) => {
      const loan = prev.find((p) => p.id === abono.prestamoId);
      if (!loan || loan.estado !== 'ACTIVO' || abono.moneda !== loan.moneda) return prev;
      const pay = Number(abono.monto.toFixed(2));
      if (pay <= 0 || pay > loan.saldoPendiente + 0.01) return prev;
      newAb = {
        ...abono,
        monto: pay,
        id: Date.now(),
        createdAt: new Date().toISOString(),
      };
      return prev.map((p) => {
        if (p.id !== abono.prestamoId) return p;
        const ns = Math.max(0, Number((p.saldoPendiente - pay).toFixed(2)));
        return {
          ...p,
          saldoPendiente: ns,
          estado: ns <= 0.005 ? 'LIQUIDADO' : p.estado,
        };
      });
    });
    if (newAb) {
      const saved = newAb;
      setPrestamoAbonos((prev) => [saved, ...prev]);
    }
    return newAb;
  }, []);

  const deleteIngreso = useCallback(async (id: string) => {
    let prevSnapshot: Ingreso[] = [];
    setIngresos((prev) => {
      prevSnapshot = prev;
      return prev.filter((i) => i.id !== id);
    });
    const res = await removeIngreso(id, profile?.empresa_id);
    if (!res.ok) {
      setIngresos(prevSnapshot);
      throw new Error(res.message);
    }
  }, [profile?.empresa_id]);

  const deleteGasto = useCallback(
    async (id: string) => {
      let before: Gasto | null = null;
      setGastos((prev) => {
        before = prev.find((g) => String(g.id) === String(id)) ?? null;
        return prev;
      });
      applyGastoRemovedLocal(String(id), before, { source: 'user', reloadSummary: false });
      const ok = await removeGasto(id, profile?.empresa_id);
      if (!ok) {
        if (before) applyGastoCreatedLocal(before, { source: 'user', reloadSummary: false });
        throw new Error('No se pudo eliminar el gasto.');
      }
      scheduleSummaryReconcile();
      return true;
    },
    [profile?.empresa_id, applyGastoRemovedLocal, applyGastoCreatedLocal, scheduleSummaryReconcile],
  );

  const upsertGasto = useCallback(
    (row: Gasto, opts?: ApplyGastoLocalOpts) => {
      const before = gastosAuditRef.current.find((g) => String(g.id) === String(row.id)) ?? null;
      setGastos((prev) => {
        if (import.meta.env.DEV) {
          console.debug('[useRegistros upsertGasto]', {
            prevLen: prev.length,
            id: row.id,
            hadBefore: !!before,
          });
        }
        return mergeGastoSorted(prev, row);
      });
      if (before) {
        const tipoChanged = before.tipo_gasto !== row.tipo_gasto;
        const montoChanged = before.monto !== row.monto;
        const revisionChanged = Boolean(before.requiere_revision) !== Boolean(row.requiere_revision);
        const src = opts?.source ?? 'user';
        if (tipoChanged || montoChanged) {
          patchFinancialSummary(
            (s) => patchSummaryForGastoMove(s, before, row, (t) => includeTipoInSummaryPatch(t)),
            { ...opts, source: src },
          );
        }
        if (tipoChanged || revisionChanged) {
          notifyGastoHistorialSync({
            kind: 'moved',
            before,
            after: row,
            movedOutOfView: false,
            removeFromVisible: false,
          });
          devLogGastoLocalMutation('moved', {
            id: row.id,
            fromTipo: before.tipo_gasto,
            toTipo: row.tipo_gasto,
            revisionChanged,
            source: src,
          });
        } else {
          notifyGastoHistorialSync({ kind: 'updated', before, after: row });
          devLogGastoLocalMutation('updated', {
            id: row.id,
            fromTipo: before.tipo_gasto,
            toTipo: row.tipo_gasto,
            source: src,
          });
        }
      } else {
        const active = enrichGastoHistorialActivity(row);
        patchFinancialSummary(
          (s) => patchSummaryAddGasto(s, active, (t) => includeTipoInSummaryPatch(t)),
          { ...opts, source: opts?.source ?? 'user' },
        );
        notifyGastoHistorialSync({ kind: 'created', gasto: active });
        devLogGastoLocalMutation('created', {
          id: active.id,
          tipo_gasto: active.tipo_gasto,
          source: opts?.source ?? 'user',
        });
      }
      if (opts?.reloadSummary !== false) scheduleSummaryReconcile();
    },
    [
      includeTipoInSummaryPatch,
      notifyGastoHistorialSync,
      patchFinancialSummary,
      scheduleSummaryReconcile,
    ],
  );

  const removeGastoLocal = useCallback(
    (id: string, opts?: ApplyGastoLocalOpts) => {
      applyGastoRemovedLocal(String(id), null, { ...opts, source: opts?.source ?? 'user' });
    },
    [applyGastoRemovedLocal],
  );

  const upsertIngreso = useCallback((row: Ingreso) => {
    setIngresos((prev) => mergeIngresoSorted(prev, row));
  }, []);

  const upsertConductor = useCallback((row: Conductor) => {
    setConductores((prev) => mergeConductorSorted(prev, row));
  }, []);

  const removeIngresoLocal = useCallback((id: string) => {
    setIngresos((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const removeConductorLocal = useCallback((id: string) => {
    setConductores((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const upsertUnidad = useCallback((row: UnidadRegistro) => {
    setUnidades((prev) => mergeUnidadSorted(prev, row));
  }, []);

  const removeUnidadLocal = useCallback((id: string) => {
    setUnidades((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const upsertVehicle = useCallback((row: Vehicle) => {
    setVehicles((prev) => mergeVehicleSorted(prev, row));
  }, []);

  const removeVehicleLocal = useCallback((id: number) => {
    setVehicles((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const removeKilometrajeLocal = useCallback((id: number) => {
    setKilometrajes((prev) => prev.filter((k) => k.id !== id));
  }, []);

  const removePendienteLocal = useCallback((id: number) => {
    setPendientes((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const upsertRegistroTiempo = useCallback((row: RegistroTiempo) => {
    setRegistrosTiempo((prev) => mergeRegistroTiempoSorted(prev, row));
  }, []);

  const removeRegistroTiempoLocal = useCallback((id: number) => {
    setRegistrosTiempo((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const upsertInversionVehiculo = useCallback((row: InversionVehiculo) => {
    setInversionesVehiculo((prev) => mergeInversionVehiculoSorted(prev, row));
  }, []);

  const removeInversionVehiculoLocal = useCallback((id: number) => {
    setInversionesVehiculo((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const upsertGastoCaja = useCallback((row: GastoCaja) => {
    setGastosCaja((prev) => mergeGastoCajaSorted(prev, row));
  }, []);

  const removeGastoCajaLocal = useCallback((id: number) => {
    setGastosCaja((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const upsertCajaNegocio = useCallback((row: CajaNegocioVehiculo) => {
    setCajaNegocioVehiculo((prev) => mergeCajaNegocioSorted(prev, row));
  }, []);

  const removeCajaNegocioLocal = useCallback((id: number) => {
    setCajaNegocioVehiculo((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const deleteDescuento = useCallback((id: number) => {
    setDescuentos((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const deletePrestamo = useCallback((id: number) => {
    setPrestamoAbonos((prev) => prev.filter((a) => a.prestamoId !== id));
    setPrestamos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const deleteUnidad = useCallback(
    async (id: string) => {
      let prevSnapshot: UnidadRegistro[] = [];
      setUnidades((prev) => {
        prevSnapshot = prev;
        return prev.filter((u) => u.id !== id);
      });
      const ok = await removeUnidad(id, profile?.empresa_id);
      if (!ok) {
        setUnidades(prevSnapshot);
        throw new Error('No se pudo eliminar la unidad.');
      }
    },
    [profile?.empresa_id],
  );

  const deleteConductor = useCallback(
    async (id: string) => {
      let prevSnapshot: Conductor[] = [];
      setConductores((prev) => {
        prevSnapshot = prev;
        return prev.filter((c) => c.id !== id);
      });
      const ok = await removeConductor(id, profile?.empresa_id);
      if (!ok) {
        setConductores(prevSnapshot);
        throw new Error('No se pudo eliminar el conductor.');
      }
    },
    [profile?.empresa_id],
  );

  const updateConductor = useCallback(
    async (id: string, patch: Partial<Omit<Conductor, 'id' | 'createdAt'>>): Promise<Conductor | null> => {
      const updated = await patchConductor(id, patch, profile?.empresa_id);
      if (!updated) return null;
      setConductores((prev) => mergeConductorSorted(prev, updated));
      return updated;
    },
    [profile?.empresa_id],
  );

  const assignConductorToVehicle = useCallback(
    async (conductorId: string, vehicleId: number | null): Promise<FleetAssignmentResult> => {
      const result = await runFleetAssignment(
        conductorId,
        vehicleId,
        conductores,
        profile?.empresa_id,
      );
      applyFleetAssignmentPatches(setConductores, result.updatedConductores);
      return result;
    },
    [conductores, profile?.empresa_id],
  );

  const clearVehicleConductor = useCallback(
    async (vehicleId: number): Promise<FleetAssignmentResult | null> => {
      const result = await unassignVehiculoConductor(vehicleId, conductores, profile?.empresa_id);
      if (result) applyFleetAssignmentPatches(setConductores, result.updatedConductores);
      return result;
    },
    [conductores, profile?.empresa_id],
  );

  const deleteControlFecha = useCallback(
    async (id: number) => {
      const ok = await removeControlFecha(id, profile?.empresa_id);
      if (!ok) throw new Error('No se pudo eliminar el control de fecha.');
      await refreshControlFechasViews();
    },
    [refreshControlFechasViews, profile?.empresa_id],
  );

  const deleteKilometraje = useCallback(
    async (id: number) => {
      let prevSnapshot: KilometrajeRegistro[] = [];
      setKilometrajes((prev) => {
        prevSnapshot = prev;
        return prev.filter((k) => k.id !== id);
      });
      const ok = await removeKilometraje(id, profile?.empresa_id);
      if (!ok) {
        setKilometrajes(prevSnapshot);
        throw new Error('No se pudo eliminar el registro de kilometraje.');
      }
    },
    [profile?.empresa_id],
  );

  const mergeKilometraje = useCallback((row: KilometrajeRegistro) => {
    setKilometrajes((prev) => mergeKilometrajeSorted(prev, row));
  }, []);

  const mergePendiente = useCallback((row: Pendiente) => {
    setPendientes((prev) => mergePendienteSorted(prev, row));
  }, []);

  const getVehicleLabel = useCallback(
    (vehicleId: number | null) => {
      if (!vehicleId) return 'General';
      const v = vehicles.find((x) => x.id === vehicleId);
      return v ? `#${v.id} ${v.marca} ${v.modelo} (${v.placa})` : `Carro #${vehicleId}`;
    },
    [vehicles],
  );

  const getVehicleById = useCallback(
    (id: number) => {
      return vehicles.find((v) => v.id === id) ?? null;
    },
    [vehicles],
  );

  const gastosPendientesRevision = useMemo(
    () => gastos.filter((g) => g.requiere_revision === true),
    [gastos],
  );

  const vehiclesRef = useRef<Vehicle[]>([]);
  const conductoresRef = useRef<Conductor[]>([]);
  const kilometrajesRef = useRef<KilometrajeRegistro[]>([]);
  vehiclesRef.current = vehicles;
  conductoresRef.current = conductores;
  kilometrajesRef.current = kilometrajes;

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void import('../audit/registerAuditGastosWindow').then(({ registerAuditGastosWindow }) => {
      registerAuditGastosWindow(() => gastosAuditRef.current);
    });
    void import('../audit/registerTechAuditWindow').then(({ registerTechAuditWindow }) => {
      registerTechAuditWindow({
        getVehicles: () => vehiclesRef.current,
        getConductores: () => conductoresRef.current,
        getKilometrajes: () => kilometrajesRef.current,
        getGastos: () => gastosAuditRef.current,
        getIngresos: () => ingresosAuditRef.current,
        getCajaNegocioVehiculo: () => cajaNegocioAuditRef.current,
        getGastosCaja: () => gastosCajaAuditRef.current,
        getDescuentos: () => descuentosAuditRef.current,
        getPermissionUser: () => permissionUserAuditRef.current,
        getGastosLoadScope: () => gastosLoadScopeRef.current,
        getEmpresaId: () => empresaIdAuditRef.current,
      });
    });
  }, []);

  return {
    vehicles,
    ingresos,
    gastos,
    gastosPendientesRevision,
    mantenimientos,
    documentaciones,
    descuentos,
    prestamos,
    prestamoAbonos,
    unidades,
    conductores,
    controlFechas,
    controlFechasHistory,
    controlFechasHistoryTotal,
    controlFechasHistoryPage,
    controlFechasHistoryPageSize: historyPageSize,
    controlFechasHistoryLoading,
    loadControlFechasHistory,
    kilometrajes,
    pendientes,
    registrosTiempo,
    inversionesVehiculo,
    gastosCaja,
    cajaNegocioVehiculo,
    addIngreso,
    addGasto,
    addMantenimiento,
    addDocumentacion,
    addDescuento,
    addPrestamo,
    addPrestamoAbono,
    addUnidad,
    addConductor,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    assignConductorToVehicle,
    clearVehicleConductor,
    updateConductor,
    addControlFecha,
    updateControlFecha,
    addKilometraje,
    addPendiente,
    updatePendiente,
    deletePendiente,
    addRegistroTiempo,
    updateRegistroTiempo,
    deleteRegistroTiempo,
    deleteIngreso,
    deleteGasto,
    upsertGasto,
    removeGastoLocal,
    applyGastoCreatedLocal,
    applyGastoUpdatedLocal,
    applyGastoRemovedLocal,
    applyGastoMovedLocal,
    subscribeGastoHistorialSync,
    filterGastosExcludingRemoved,
    registrosRemoteTick,
    bumpRegistrosRemoteSync,
    upsertIngreso,
    removeIngresoLocal,
    upsertConductor,
    removeConductorLocal,
    upsertUnidad,
    removeUnidadLocal,
    upsertVehicle,
    removeVehicleLocal,
    removeKilometrajeLocal,
    removePendienteLocal,
    upsertRegistroTiempo,
    removeRegistroTiempoLocal,
    upsertInversionVehiculo,
    removeInversionVehiculoLocal,
    upsertGastoCaja,
    removeGastoCajaLocal,
    removeControlFechaLocal,
    upsertCajaNegocio,
    removeCajaNegocioLocal,
    refreshControlFechasViews,
    deleteDescuento,
    deletePrestamo,
    deleteUnidad,
    deleteConductor,
    deleteControlFecha,
    deleteKilometraje,
    mergeKilometraje,
    mergePendiente,
    getVehicleLabel,
    getVehicleById,
    setVehicles,
    setUnidades,
    refreshFromSupabase,
    reloadGastosOnly,
    reloadGastosFull,
    gastosLoadScope,
    isLoadingGastosFull,
    gastosFinancialSummary,
    isLoadingGastosSummary,
    reloadGastosFinancialSummary,
    reloadIngresosOnly,
    reloadKilometrajesOnly,
    reloadPendientesOnly,
    reloadControlFechasLatest,
    registrosBootstrapComplete,
    registrosBootstrapLoading,
    registrosBootstrapStarted,
    isLoadingGastos,
    hasLoadedGastosOnce,
  };
};
