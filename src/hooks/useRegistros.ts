import { useState, useCallback, useEffect, useRef } from 'react';
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
import { enrichGastoOperativo, enrichIngresoOperativo } from '../utils/registroOperativo';

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

  const refreshFromSupabase = useCallback(async () => {
    const [v, u, c, i, g, latest, km, pen, rt] = await Promise.all([
      fetchVehiculos(),
      fetchUnidades(),
      fetchConductores(),
      fetchIngresos(),
      fetchGastos(),
      fetchLatestControlFechasByVehicle(),
      fetchKilometrajes(),
      fetchPendientes(),
      fetchRegistrosTiempo(),
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

    const q = historyQueryRef.current;
    if (q) {
      await loadControlFechasHistory(q.filters, q.page);
    }
  }, [loadControlFechasHistory]);

  useEffect(() => {
    void refreshFromSupabase();
  }, [refreshFromSupabase]);

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
      await refreshFromSupabase();
      return created;
    },
    [refreshFromSupabase, vehicles],
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
      await refreshFromSupabase();
      return created;
    },
    [refreshFromSupabase, vehicles],
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
      await refreshFromSupabase();
      return created;
    },
    [refreshFromSupabase],
  );

  const addConductor = useCallback(
    async (row: Omit<Conductor, 'id' | 'createdAt'>) => {
      const created = await insertConductor(row);
      if (!created) throw new Error('No se pudo guardar el conductor en Supabase.');
      await refreshFromSupabase();
      return created;
    },
    [refreshFromSupabase],
  );

  const addControlFecha = useCallback(
    async (row: Omit<ControlFecha, 'id' | 'createdAt'>) => {
      const created = await insertControlFecha(row);
      if (!created) throw new Error('No se pudo guardar el control de fecha en Supabase.');
      await refreshFromSupabase();
      return created;
    },
    [refreshFromSupabase],
  );

  const addKilometraje = useCallback(
    async (row: Omit<KilometrajeRegistro, 'id' | 'createdAt'>) => {
      const created = await insertKilometraje(row);
      if (!created) throw new Error('No se pudo guardar el kilometraje en Supabase.');
      await refreshFromSupabase();
      return created;
    },
    [refreshFromSupabase],
  );

  const addPendiente = useCallback(
    async (row: Omit<Pendiente, 'id' | 'createdAt'>) => {
      const created = await insertPendiente(row);
      if (!created) throw new Error('No se pudo guardar el pendiente en Supabase.');
      await refreshFromSupabase();
      return created;
    },
    [refreshFromSupabase],
  );

  const updatePendiente = useCallback(
    async (id: number, patch: Partial<Omit<Pendiente, 'id' | 'createdAt'>>): Promise<Pendiente | null> => {
      const updated = await patchPendiente(id, patch);
      if (!updated) return null;
      await refreshFromSupabase();
      return updated;
    },
    [refreshFromSupabase],
  );

  const deletePendiente = useCallback(
    async (id: number) => {
      const ok = await removePendiente(id);
      if (!ok) throw new Error('No se pudo eliminar el pendiente.');
      await refreshFromSupabase();
    },
    [refreshFromSupabase],
  );

  const addRegistroTiempo = useCallback(
    async (row: Omit<RegistroTiempo, 'id' | 'createdAt'>) => {
      const created = await insertRegistroTiempo(row);
      if (!created) throw new Error('No se pudo guardar el registro de tiempo en Supabase.');
      await refreshFromSupabase();
      return created;
    },
    [refreshFromSupabase],
  );

  const updateRegistroTiempo = useCallback(
    async (id: number, patch: Partial<Omit<RegistroTiempo, 'id' | 'createdAt'>>): Promise<RegistroTiempo | null> => {
      const updated = await patchRegistroTiempo(id, patch);
      if (!updated) return null;
      await refreshFromSupabase();
      return updated;
    },
    [refreshFromSupabase],
  );

  const deleteRegistroTiempo = useCallback(
    async (id: number) => {
      const ok = await removeRegistroTiempo(id);
      if (!ok) throw new Error('No se pudo eliminar el registro de tiempo.');
      await refreshFromSupabase();
    },
    [refreshFromSupabase],
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

  const deleteIngreso = useCallback(
    async (id: number) => {
      const ok = await removeIngreso(id);
      if (!ok) throw new Error('No se pudo eliminar el ingreso.');
      await refreshFromSupabase();
    },
    [refreshFromSupabase],
  );

  const deleteGasto = useCallback(
    async (id: number) => {
      const ok = await removeGasto(id);
      if (!ok) throw new Error('No se pudo eliminar el gasto.');
      await refreshFromSupabase();
    },
    [refreshFromSupabase],
  );

  const deleteDescuento = useCallback((id: number) => {
    setDescuentos((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const deletePrestamo = useCallback((id: number) => {
    setPrestamoAbonos((prev) => prev.filter((a) => a.prestamoId !== id));
    setPrestamos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const deleteUnidad = useCallback(
    async (id: string) => {
      const ok = await removeUnidad(id);
      if (!ok) throw new Error('No se pudo eliminar la unidad.');
      await refreshFromSupabase();
    },
    [refreshFromSupabase],
  );

  const deleteConductor = useCallback(
    async (id: number) => {
      const ok = await removeConductor(id);
      if (!ok) throw new Error('No se pudo eliminar el conductor.');
      await refreshFromSupabase();
    },
    [refreshFromSupabase],
  );

  const updateConductor = useCallback(
    async (id: number, patch: Partial<Omit<Conductor, 'id' | 'createdAt'>>): Promise<Conductor | null> => {
      const updated = await patchConductor(id, patch);
      if (!updated) return null;
      await refreshFromSupabase();
      return updated;
    },
    [refreshFromSupabase],
  );

  const deleteControlFecha = useCallback(
    async (id: number) => {
      const ok = await removeControlFecha(id);
      if (!ok) throw new Error('No se pudo eliminar el control de fecha.');
      await refreshFromSupabase();
    },
    [refreshFromSupabase],
  );

  const deleteKilometraje = useCallback(
    async (id: number) => {
      const ok = await removeKilometraje(id);
      if (!ok) throw new Error('No se pudo eliminar el registro de kilometraje.');
      await refreshFromSupabase();
    },
    [refreshFromSupabase],
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

  return {
    vehicles,
    ingresos,
    gastos,
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
  };
};
