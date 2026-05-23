import { useState, useCallback, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
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
import { fetchVehiculos } from '../services/vehiculosService';
import { fetchUnidades, insertUnidad, removeUnidad } from '../services/unidadesService';
import {
  fetchConductores,
  insertConductor,
  patchConductor,
  removeConductor,
} from '../services/conductoresService';
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
import { canUseIngresos, canUseInversiones, permissionUserFromAuth } from '../utils/permissions';

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
  const { isAuthenticated, profile, user } = useAuth();

  const [isLoadingGastos, setIsLoadingGastos] = useState(false);
  const [hasLoadedGastosOnce, setHasLoadedGastosOnce] = useState(false);
  const [gastosLoadScope, setGastosLoadScope] = useState<'recent' | 'full'>('recent');
  const [isLoadingGastosFull, setIsLoadingGastosFull] = useState(false);
  const [gastosFinancialSummary, setGastosFinancialSummary] = useState<GastosFinancialSummary | null>(null);
  const [isLoadingGastosSummary, setIsLoadingGastosSummary] = useState(false);
  const reloadGastosSummaryRef = useRef<() => Promise<void>>(async () => {});

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

  /** Agregados financieros globales (RPC; no trae filas). */
  const reloadGastosFinancialSummary = useCallback(async () => {
    if (!profile?.empresa_id) {
      setGastosFinancialSummary(null);
      return;
    }
    setIsLoadingGastosSummary(true);
    try {
      const summary = await fetchGastosFinancialSummary(profile.empresa_id);
      setGastosFinancialSummary(summary);
      if (import.meta.env.DEV) {
        console.log('[summary-context]', summary);
      }
    } finally {
      setIsLoadingGastosSummary(false);
    }
  }, [profile?.empresa_id]);

  reloadGastosSummaryRef.current = reloadGastosFinancialSummary;

  /** Recarga bootstrap (recientes + tipos críticos) + summary BD. */
  const reloadGastosOnly = useCallback(async () => {
    await Promise.all([loadGastosBootstrap(), reloadGastosFinancialSummary()]);
  }, [loadGastosBootstrap, reloadGastosFinancialSummary]);

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
      const v = vehicles.find((x) => x.id === ingreso.vehicleId);
      const detalleDelAuto = v ? `${v.marca} ${v.modelo} — ${v.placa}` : null;
      const norm = normalizeIngresoMoneda({
        ...ingreso,
        ...enrichIngresoOperativo({
          comentarios: ingreso.comentarios,
          tipo: ingreso.tipo,
          subTipo: ingreso.subTipo,
          detalleDelAuto,
        }),
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
      setGastos((prev) => {
        if (import.meta.env.DEV) {
          console.debug('[useRegistros addGasto]', { prevLen: prev.length, createdId: created.id, fecha: created.fecha });
        }
        const merged = mergeGastoSorted(prev, created);
        if (import.meta.env.DEV) {
          console.debug('[useRegistros addGasto] tras merge', { nextLen: merged.length });
        }
        return merged;
      });
      void reloadGastosSummaryRef.current();
      return created;
    },
    [vehicles, profile?.empresa_id],
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

  const addControlFecha = useCallback(
    async (row: Omit<ControlFecha, 'id' | 'createdAt'>) => {
      const created = await insertControlFecha(row, profile?.empresa_id);
      if (!created) throw new Error('No se pudo guardar el control de fecha en Supabase.');
      await refreshControlFechasViews();
      return created;
    },
    [refreshControlFechasViews, profile?.empresa_id],
  );

  const addKilometraje = useCallback(
    async (row: Omit<KilometrajeRegistro, 'id' | 'createdAt'>) => {
      const created = await insertKilometraje(row, profile?.empresa_id);
      if (!created) throw new Error('No se pudo guardar el kilometraje en Supabase.');
      setKilometrajes((prev) => mergeKilometrajeSorted(prev, created));
      return created;
    },
    [profile?.empresa_id],
  );

  const addPendiente = useCallback(
    async (row: Omit<Pendiente, 'id' | 'createdAt'>) => {
      const created = await insertPendiente(row, profile?.empresa_id);
      if (!created) throw new Error('No se pudo guardar el pendiente en Supabase.');
      setPendientes((prev) => mergePendienteSorted(prev, created));
      return created;
    },
    [profile?.empresa_id],
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

  const deleteGasto = useCallback(async (id: string) => {
    let prevSnapshot: Gasto[] = [];
    setGastos((prev) => {
      prevSnapshot = prev;
      return prev.filter((g) => String(g.id) !== String(id));
    });
    const ok = await removeGasto(id, profile?.empresa_id);
    if (!ok) {
      setGastos(prevSnapshot);
      throw new Error('No se pudo eliminar el gasto.');
    }
    void reloadGastosSummaryRef.current();
  }, [profile?.empresa_id]);

  const upsertGasto = useCallback((row: Gasto) => {
    setGastos((prev) => {
      if (import.meta.env.DEV) {
        console.debug('[useRegistros upsertGasto]', { prevLen: prev.length, id: row.id });
      }
      return mergeGastoSorted(prev, row);
    });
    void reloadGastosSummaryRef.current();
  }, []);

  const removeGastoLocal = useCallback((id: string) => {
    setGastos((prev) => prev.filter((g) => String(g.id) !== String(id)));
    void reloadGastosSummaryRef.current();
  }, []);

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

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void import('../audit/registerAuditGastosWindow').then(({ registerAuditGastosWindow }) => {
      registerAuditGastosWindow(() => gastosAuditRef.current);
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
    updateConductor,
    addControlFecha,
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
