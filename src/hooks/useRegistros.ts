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
import { fetchGastos, insertGasto, removeGasto } from '../services/gastosService';
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
import { useAuth } from '../context/AuthContext';

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

/** Mismo criterio que fetchIngresos: fecha desc, luego id desc. Evita recargar toda la app tras un alta. */
function mergeIngresoSorted(prev: Ingreso[], row: Ingreso): Ingreso[] {
  const without = prev.some((x) => x.id === row.id) ? prev.filter((x) => x.id !== row.id) : prev;
  const next = [...without, row];
  next.sort((a, b) => {
    const fd = b.fecha.localeCompare(a.fecha);
    if (fd !== 0) return fd;
    return String(b.id).localeCompare(String(a.id));
  });
  return next;
}

/** Mismo criterio que fetchGastos: fecha desc, luego id desc. */
function mergeGastoSorted(prev: Gasto[], row: Gasto): Gasto[] {
  const without = prev.some((x) => x.id === row.id) ? prev.filter((x) => x.id !== row.id) : prev;
  const next = [...without, row];
  next.sort((a, b) => {
    const fd = b.fecha.localeCompare(a.fecha);
    if (fd !== 0) return fd;
    return b.id - a.id;
  });
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
  next.sort((a, b) => b.id - a.id);
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
  const { isAuthenticated } = useAuth();
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
        const { rows, total } = await fetchControlFechasHistoryPage(filters, p, historyPageSize);
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
  }, [historyPageSize]);

  /** RPC resumen + re-paginar historial si el usuario lo tenía abierto (sin refresh global). */
  const refreshControlFechasViews = useCallback(async () => {
    const latest = await fetchLatestControlFechasByVehicle();
    setControlFechas(latest);
    const q = historyQueryRef.current;
    if (q) await loadControlFechasHistory(q.filters, q.page);
  }, [loadControlFechasHistory]);

  const refreshFromSupabase = useCallback(async () => {
    if (refreshInFlightRef.current) {
      await refreshInFlightRef.current;
      return;
    }
    const runner = (async () => {
      const [v, u, c, i, g, latest, km, pen, rt, inv, cn] = await Promise.all([
        fetchVehiculos(),
        fetchUnidades(),
        fetchConductores(),
        fetchIngresos(),
        fetchGastos(),
        fetchLatestControlFechasByVehicle(),
        fetchKilometrajes(),
        fetchPendientes(),
        fetchRegistrosTiempo(),
        fetchInversionesVehiculo(),
        fetchCajaNegocioVehiculo(),
      ]);
      setVehicles(v);
      setUnidades(u);
      setConductores(c);
      setIngresos(i);
      setGastos(g);
      setControlFechas(latest);
      setKilometrajes(km);
      setPendientes(pen);
      setRegistrosTiempo(rt);
      setInversionesVehiculo(inv);
      setCajaNegocioVehiculo(cn);

      // `gastos_caja` es histórico y no bloquea la percepción inicial en home.
      void fetchGastosCaja()
        .then((gc) => setGastosCaja(gc))
        .catch((e) => {
          console.error('[useRegistros refreshFromSupabase fetchGastosCaja]', e);
        });

      const q = historyQueryRef.current;
      if (q) {
        await loadControlFechasHistory(q.filters, q.page);
      }
    })();
    refreshInFlightRef.current = runner;
    try {
      await runner;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, [loadControlFechasHistory]);

  /**
   * Sin sesión: listo (no overlay). Con sesión: incompleto antes de pintar el dashboard,
   * para evitar un frame sin overlay tras login.
   */
  useLayoutEffect(() => {
    if (!isAuthenticated) {
      setRegistrosBootstrapComplete(true);
      setRegistrosBootstrapLoading(false);
      setRegistrosBootstrapStarted(false);
    } else {
      setRegistrosBootstrapComplete(false);
      setRegistrosBootstrapLoading(true);
      setRegistrosBootstrapStarted(true);
    }
  }, [isAuthenticated]);

  /** Con sesión: refresh + mínimo 1200 ms desde inicio de este ciclo; tope MAX_MS. */
  useEffect(() => {
    if (!isAuthenticated) return;

    let canceled = false;
    const t0 = performance.now();
    const MIN_MS = 1200;
    const MAX_MS = 24000;

    const forceDone = window.setTimeout(() => {
      if (!canceled) {
        setRegistrosBootstrapLoading(false);
        setRegistrosBootstrapComplete(true);
        setRegistrosBootstrapStarted(false);
      }
    }, MAX_MS);

    void refreshFromSupabase()
      .catch(() => {
        /* errores ya logueados en servicios */
      })
      .finally(() => {
        if (canceled) return;
        window.clearTimeout(forceDone);
        const wait = Math.max(0, MIN_MS - (performance.now() - t0));
        window.setTimeout(() => {
          if (canceled) return;
          setRegistrosBootstrapLoading(false);
          setRegistrosBootstrapComplete(true);
          setRegistrosBootstrapStarted(false);
        }, wait);
      });

    return () => {
      canceled = true;
      window.clearTimeout(forceDone);
    };
  }, [isAuthenticated, refreshFromSupabase]);

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
      const created = await insertIngreso(norm);
      if (!created) throw new Error('No se pudo guardar el ingreso en Supabase.');
      setIngresos((prev) => mergeIngresoSorted(prev, created));
      return created;
    },
    [vehicles],
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
      const created = await insertGasto(row);
      if (!created) throw new Error('No se pudo guardar el gasto en Supabase.');
      setGastos((prev) => mergeGastoSorted(prev, created));
      return created;
    },
    [vehicles],
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
      const created = await insertUnidad(row);
      if (!created) throw new Error('No se pudo guardar la unidad en Supabase.');
      setUnidades((prev) => mergeUnidadSorted(prev, created));
      return created;
    },
    [],
  );

  const addConductor = useCallback(
    async (row: Omit<Conductor, 'id' | 'createdAt'>) => {
      const created = await insertConductor(row);
      if (!created) throw new Error('No se pudo guardar el conductor en Supabase.');
      setConductores((prev) => mergeConductorSorted(prev, created));
      return created;
    },
    [],
  );

  const addControlFecha = useCallback(
    async (row: Omit<ControlFecha, 'id' | 'createdAt'>) => {
      const created = await insertControlFecha(row);
      if (!created) throw new Error('No se pudo guardar el control de fecha en Supabase.');
      await refreshControlFechasViews();
      return created;
    },
    [refreshControlFechasViews],
  );

  const addKilometraje = useCallback(
    async (row: Omit<KilometrajeRegistro, 'id' | 'createdAt'>) => {
      const created = await insertKilometraje(row);
      if (!created) throw new Error('No se pudo guardar el kilometraje en Supabase.');
      setKilometrajes((prev) => mergeKilometrajeSorted(prev, created));
      return created;
    },
    [],
  );

  const addPendiente = useCallback(
    async (row: Omit<Pendiente, 'id' | 'createdAt'>) => {
      const created = await insertPendiente(row);
      if (!created) throw new Error('No se pudo guardar el pendiente en Supabase.');
      setPendientes((prev) => mergePendienteSorted(prev, created));
      return created;
    },
    [],
  );

  const updatePendiente = useCallback(
    async (id: number, patch: Partial<Omit<Pendiente, 'id' | 'createdAt'>>): Promise<Pendiente | null> => {
      const updated = await patchPendiente(id, patch);
      if (!updated) return null;
      setPendientes((prev) => mergePendienteSorted(prev, updated));
      return updated;
    },
    [],
  );

  const deletePendiente = useCallback(
    async (id: number) => {
      let prevSnapshot: Pendiente[] = [];
      setPendientes((prev) => {
        prevSnapshot = prev;
        return prev.filter((p) => p.id !== id);
      });
      const ok = await removePendiente(id);
      if (!ok) {
        setPendientes(prevSnapshot);
        throw new Error('No se pudo eliminar el pendiente.');
      }
    },
    [],
  );

  const addRegistroTiempo = useCallback(
    async (row: Omit<RegistroTiempo, 'id' | 'createdAt'>) => {
      const created = await insertRegistroTiempo(row);
      if (!created) throw new Error('No se pudo guardar el registro de tiempo en Supabase.');
      setRegistrosTiempo((prev) => mergeRegistroTiempoSorted(prev, created));
      return created;
    },
    [],
  );

  const updateRegistroTiempo = useCallback(
    async (id: number, patch: Partial<Omit<RegistroTiempo, 'id' | 'createdAt'>>): Promise<RegistroTiempo | null> => {
      const updated = await patchRegistroTiempo(id, patch);
      if (!updated) return null;
      setRegistrosTiempo((prev) => mergeRegistroTiempoSorted(prev, updated));
      return updated;
    },
    [],
  );

  const deleteRegistroTiempo = useCallback(
    async (id: number) => {
      let prevSnapshot: RegistroTiempo[] = [];
      setRegistrosTiempo((prev) => {
        prevSnapshot = prev;
        return prev.filter((r) => r.id !== id);
      });
      const ok = await removeRegistroTiempo(id);
      if (!ok) {
        setRegistrosTiempo(prevSnapshot);
        throw new Error('No se pudo eliminar el registro de tiempo.');
      }
    },
    [],
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
    const res = await removeIngreso(id);
    if (!res.ok) {
      setIngresos(prevSnapshot);
      throw new Error(res.message);
    }
  }, []);

  const deleteGasto = useCallback(async (id: number) => {
    let prevSnapshot: Gasto[] = [];
    setGastos((prev) => {
      prevSnapshot = prev;
      return prev.filter((g) => g.id !== id);
    });
    const ok = await removeGasto(id);
    if (!ok) {
      setGastos(prevSnapshot);
      throw new Error('No se pudo eliminar el gasto.');
    }
  }, []);

  const upsertGasto = useCallback((row: Gasto) => {
    setGastos((prev) => mergeGastoSorted(prev, row));
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
      const ok = await removeUnidad(id);
      if (!ok) {
        setUnidades(prevSnapshot);
        throw new Error('No se pudo eliminar la unidad.');
      }
    },
    [],
  );

  const deleteConductor = useCallback(
    async (id: number) => {
      let prevSnapshot: Conductor[] = [];
      setConductores((prev) => {
        prevSnapshot = prev;
        return prev.filter((c) => c.id !== id);
      });
      const ok = await removeConductor(id);
      if (!ok) {
        setConductores(prevSnapshot);
        throw new Error('No se pudo eliminar el conductor.');
      }
    },
    [],
  );

  const updateConductor = useCallback(
    async (id: number, patch: Partial<Omit<Conductor, 'id' | 'createdAt'>>): Promise<Conductor | null> => {
      const updated = await patchConductor(id, patch);
      if (!updated) return null;
      setConductores((prev) => mergeConductorSorted(prev, updated));
      return updated;
    },
    [],
  );

  const deleteControlFecha = useCallback(
    async (id: number) => {
      const ok = await removeControlFecha(id);
      if (!ok) throw new Error('No se pudo eliminar el control de fecha.');
      await refreshControlFechasViews();
    },
    [refreshControlFechasViews],
  );

  const deleteKilometraje = useCallback(
    async (id: number) => {
      let prevSnapshot: KilometrajeRegistro[] = [];
      setKilometrajes((prev) => {
        prevSnapshot = prev;
        return prev.filter((k) => k.id !== id);
      });
      const ok = await removeKilometraje(id);
      if (!ok) {
        setKilometrajes(prevSnapshot);
        throw new Error('No se pudo eliminar el registro de kilometraje.');
      }
    },
    [],
  );

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
    deleteDescuento,
    deletePrestamo,
    deleteUnidad,
    deleteConductor,
    deleteControlFecha,
    deleteKilometraje,
    getVehicleLabel,
    getVehicleById,
    setVehicles,
    setUnidades,
    refreshFromSupabase,
    registrosBootstrapComplete,
    registrosBootstrapLoading,
    registrosBootstrapStarted,
  };
};
