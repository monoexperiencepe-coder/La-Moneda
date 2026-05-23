import React, { createContext, useContext, ReactNode, useCallback, useMemo, useEffect } from 'react';
import { useRegistros } from '../hooks/useRegistros';
import { useToast } from '../hooks/useToast';
import { ToastMessage } from '../components/Common/Toast';
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
import { ingresoMontoPEN } from '../utils/moneda';
import type { ControlFechasHistoryFilters } from '../services/controlFechasService';
import { useAuth } from './AuthContext';
import { filterGastosForUser, permissionUserFromAuth, canViewGastoTipo } from '../utils/permissions';
import { useEmpresaRegistrosRealtime } from '../hooks/useEmpresaRegistrosRealtime';
import { canCreateIngresos, canMutateIngresos } from '../utils/roles';
import { useUndoManager } from './UndoManagerContext';
import type { GastosFinancialSummary } from '../utils/gastosFinancialSummary';
import { createShowUndoToast, type ShowUndoToastParams } from '../hooks/useUndoToast';
import {
  undoCreateConductor,
  undoCreateGasto,
  undoCreateIngreso,
  undoDeleteConductor,
  undoDeleteGasto,
  undoDeleteIngreso,
  undoUpdateConductor,
  undoCreateKilometraje,
  undoDeleteKilometraje,
  undoCreatePendiente,
  undoDeletePendiente,
  undoUpdatePendiente,
} from '../undo/factories';

interface RegistrosContextValue {
  vehicles: Vehicle[];
  ingresos: Ingreso[];
  gastos: Gasto[];
  /** Subconjunto: requiere revisión de clasificación (cliente; misma regla que cola de revisión). */
  gastosPendientesRevision: Gasto[];
  descuentos: Descuento[];
  prestamos: Prestamo[];
  prestamoAbonos: PrestamoAbono[];
  unidades: UnidadRegistro[];
  conductores: Conductor[];
  controlFechas: ControlFecha[];
  controlFechasHistory: ControlFecha[];
  controlFechasHistoryTotal: number | null;
  controlFechasHistoryPage: number;
  controlFechasHistoryPageSize: number;
  controlFechasHistoryLoading: boolean;
  loadControlFechasHistory: (filters: ControlFechasHistoryFilters, page: number) => Promise<void>;
  kilometrajes: KilometrajeRegistro[];
  pendientes: Pendiente[];
  registrosTiempo: RegistroTiempo[];
  inversionesVehiculo: InversionVehiculo[];
  gastosCaja: GastoCaja[];
  cajaNegocioVehiculo: CajaNegocioVehiculo[];
  mantenimientos: Mantenimiento[];
  documentaciones: Documentacion[];
  addIngreso: (data: Omit<Ingreso, 'id' | 'createdAt'>) => Promise<Ingreso | null>;
  addGasto: (data: Omit<Gasto, 'id' | 'createdAt'>) => Promise<Gasto | null>;
  addDescuento: (data: Omit<Descuento, 'id' | 'createdAt'>) => Descuento;
  addPrestamo: (data: Omit<Prestamo, 'id' | 'createdAt'>) => Prestamo;
  addPrestamoAbono: (data: Omit<PrestamoAbono, 'id' | 'createdAt'>) => PrestamoAbono | null;
  addUnidad: (data: Omit<UnidadRegistro, 'id' | 'createdAt'>) => Promise<UnidadRegistro | null>;
  addConductor: (data: Omit<Conductor, 'id' | 'createdAt'>) => Promise<Conductor | null>;
  updateConductor: (
    id: string,
    patch: Partial<Omit<Conductor, 'id' | 'createdAt'>>,
  ) => Promise<Conductor | null>;
  addControlFecha: (data: Omit<ControlFecha, 'id' | 'createdAt'>) => Promise<ControlFecha | null>;
  addKilometraje: (data: Omit<KilometrajeRegistro, 'id' | 'createdAt'>) => Promise<KilometrajeRegistro | null>;
  addPendiente: (data: Omit<Pendiente, 'id' | 'createdAt'>) => Promise<Pendiente | null>;
  updatePendiente: (
    id: number,
    patch: Partial<Omit<Pendiente, 'id' | 'createdAt'>>,
  ) => Promise<Pendiente | null>;
  deletePendiente: (id: number) => Promise<boolean>;
  addRegistroTiempo: (data: Omit<RegistroTiempo, 'id' | 'createdAt'>) => Promise<RegistroTiempo | null>;
  updateRegistroTiempo: (
    id: number,
    patch: Partial<Omit<RegistroTiempo, 'id' | 'createdAt'>>,
  ) => Promise<RegistroTiempo | null>;
  deleteRegistroTiempo: (id: number) => Promise<boolean>;
  addMantenimiento: (data: Omit<Mantenimiento, 'id' | 'createdAt'>) => Mantenimiento;
  addDocumentacion: (data: Omit<Documentacion, 'id' | 'createdAt'>) => Documentacion;
  deleteIngreso: (id: string) => Promise<boolean>;
  deleteGasto: (id: string) => Promise<boolean>;
  /** Actualiza o inserta un gasto en el estado local (misma orden que fetch). */
  upsertGasto: (g: Gasto) => void;
  /** Actualiza o inserta un ingreso en el estado local (misma orden que fetch). */
  upsertIngreso: (i: Ingreso) => void;
  deleteDescuento: (id: number) => void;
  deletePrestamo: (id: number) => void;
  deleteUnidad: (id: string) => Promise<boolean>;
  deleteConductor: (id: string) => Promise<boolean>;
  deleteControlFecha: (id: number) => Promise<boolean>;
  deleteKilometraje: (id: number) => Promise<boolean>;
  getVehicleLabel: (vehicleId: number | null) => string;
  getVehicleById: (id: number) => Vehicle | null;
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
  toast: {
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    warning: (title: string, message?: string) => void;
    info: (title: string, message?: string) => void;
  };
  /** Toast con botón Deshacer + rollback Supabase/local. */
  showUndoToast: (params: ShowUndoToastParams) => string;
  refreshFromSupabase: () => Promise<void>;
  /** Recarga solo la lista de gastos (bootstrap reciente, sin histórico completo). */
  reloadGastosOnly: () => Promise<void>;
  /** Carga histórico completo bajo demanda. */
  reloadGastosFull: () => Promise<void>;
  /** `recent` = bootstrap; `full` = histórico completo cargado. */
  gastosLoadScope: 'recent' | 'full';
  /** True mientras corre fetchGastosFull. */
  isLoadingGastosFull: boolean;
  /** Agregados financieros globales (RPC; totales reales sin histórico en memoria). */
  gastosFinancialSummary: GastosFinancialSummary | null;
  /** Fetch del summary RPC en curso. */
  isLoadingGastosSummary: boolean;
  /** Recarga agregados financieros desde Supabase. */
  reloadGastosFinancialSummary: () => Promise<void>;
  /** Recarga solo ingresos. */
  reloadIngresosOnly: () => Promise<void>;
  /** Recarga solo kilometrajes. */
  reloadKilometrajesOnly: () => Promise<void>;
  /** Recarga solo pendientes. */
  reloadPendientesOnly: () => Promise<void>;
  /** RPC resumen de controles + historial si estaba abierto. */
  reloadControlFechasLatest: () => Promise<void>;
  /** Con sesión: `false` hasta terminar la primera carga post-auth (+ mín. 1,2 s). Sin sesión: `true`. */
  registrosBootstrapComplete: boolean;
  /** `true` mientras corre el refresh del ciclo post-autenticación. */
  registrosBootstrapLoading: boolean;
  /** Alias: `registrosBootstrapLoading && !registrosBootstrapComplete`. */
  isBootstrapLoading: boolean;
  /** `true` desde que arranca el ciclo post-auth hasta marcar complete. */
  registrosBootstrapStarted: boolean;
  /** Fetch de `gastos` en curso (bootstrap, recarga manual o realtime indirecto). */
  isLoadingGastos: boolean;
  /** `true` tras el primer fetch de gastos de la sesión/usuario actual. */
  hasLoadedGastosOnce: boolean;
  /** Suscripción realtime activa (registros de la empresa en Supabase). */
  registrosRealtimeConnected: boolean;
  /** @deprecated Usar registrosRealtimeConnected */
  gastosRealtimeConnected: boolean;
}

const RegistrosContext = createContext<RegistrosContextValue | null>(null);

export const RegistrosProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const registros = useRegistros();
  const toastHook = useToast();
  const { role, user, profile, isAuthenticated } = useAuth();
  const undoManager = useUndoManager();

  const permissionUser = useMemo(
    () => permissionUserFromAuth(user, profile?.email ?? null),
    [user, profile?.email],
  );

  const visibleGastos = useMemo(
    () => filterGastosForUser(permissionUser, registros.gastos),
    [permissionUser, registros.gastos],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('[summary-context]', registros.gastosFinancialSummary);
  }, [registros.gastosFinancialSummary]);

  const realtimeHandlers = useMemo(
    () => ({
      upsertGasto: registros.upsertGasto,
      removeGastoLocal: registros.removeGastoLocal,
      upsertIngreso: registros.upsertIngreso,
      removeIngresoLocal: registros.removeIngresoLocal,
      upsertConductor: registros.upsertConductor,
      removeConductorLocal: registros.removeConductorLocal,
      upsertUnidad: registros.upsertUnidad,
      removeUnidadLocal: registros.removeUnidadLocal,
      upsertVehicle: registros.upsertVehicle,
      removeVehicleLocal: registros.removeVehicleLocal,
      mergeKilometraje: registros.mergeKilometraje,
      removeKilometrajeLocal: registros.removeKilometrajeLocal,
      mergePendiente: registros.mergePendiente,
      removePendienteLocal: registros.removePendienteLocal,
      upsertRegistroTiempo: registros.upsertRegistroTiempo,
      removeRegistroTiempoLocal: registros.removeRegistroTiempoLocal,
      upsertInversionVehiculo: registros.upsertInversionVehiculo,
      removeInversionVehiculoLocal: registros.removeInversionVehiculoLocal,
      upsertGastoCaja: registros.upsertGastoCaja,
      removeGastoCajaLocal: registros.removeGastoCajaLocal,
      upsertCajaNegocio: registros.upsertCajaNegocio,
      removeCajaNegocioLocal: registros.removeCajaNegocioLocal,
      refreshControlFechasViews: registros.refreshControlFechasViews,
    }),
    [
      registros.upsertGasto,
      registros.removeGastoLocal,
      registros.upsertIngreso,
      registros.removeIngresoLocal,
      registros.upsertConductor,
      registros.removeConductorLocal,
      registros.upsertUnidad,
      registros.removeUnidadLocal,
      registros.upsertVehicle,
      registros.removeVehicleLocal,
      registros.mergeKilometraje,
      registros.removeKilometrajeLocal,
      registros.mergePendiente,
      registros.removePendienteLocal,
      registros.upsertRegistroTiempo,
      registros.removeRegistroTiempoLocal,
      registros.upsertInversionVehiculo,
      registros.removeInversionVehiculoLocal,
      registros.upsertGastoCaja,
      registros.removeGastoCajaLocal,
      registros.upsertCajaNegocio,
      registros.removeCajaNegocioLocal,
      registros.refreshControlFechasViews,
    ],
  );

  const handleRemoteRegistrosActivity = useCallback(
    ({ count }: { count: number }) => {
      if (count === 1) {
        toastHook.info('Sincronizado', 'Un registro se actualizó desde otra cuenta.');
      } else if (count > 1) {
        toastHook.info('Sincronizado', `${count} cambios aplicados desde otra cuenta.`);
      }
    },
    [toastHook],
  );

  const { connected: registrosRealtimeConnected } = useEmpresaRegistrosRealtime({
    enabled: isAuthenticated && registros.registrosBootstrapComplete,
    permissionUser,
    handlers: realtimeHandlers,
    onRemoteActivity: handleRemoteRegistrosActivity,
  });

  const showUndoToast = useMemo(
    () =>
      createShowUndoToast(
        {
          success: toastHook.success,
          error: toastHook.error,
          addToastWithAction: toastHook.addToastWithAction,
          removeToast: toastHook.removeToast,
        },
        undoManager,
      ),
    [toastHook, undoManager],
  );

  const handleAddIngreso = async (data: Omit<Ingreso, 'id' | 'createdAt'>) => {
    if (!canCreateIngresos(role)) {
      toastHook.error('Sin permiso', 'No tienes permiso para registrar ingresos.');
      return null;
    }
    try {
      const result = await registros.addIngreso(data);
      const ref = ingresoMontoPEN(result);
      const moneda = data.moneda ?? 'PEN';
      const msg =
        moneda === 'USD'
          ? `US$ ${data.monto.toFixed(2)} (≈ S/ ${ref.toFixed(2)}) — ${data.tipo}`
          : `+S/ ${ref.toFixed(2)} — ${data.tipo}`;
      showUndoToast({
        message: 'Ingreso registrado',
        detail: msg,
        undoAction: undoCreateIngreso(result, (id) => registros.deleteIngreso(id)),
      });
      return result;
    } catch (e) {
      toastHook.error('No se pudo registrar el ingreso', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleAddGasto = async (data: Omit<Gasto, 'id' | 'createdAt'>) => {
    if (!canViewGastoTipo(permissionUser, data.tipo_gasto ?? null)) {
      toastHook.error('Sin permiso', 'No puedes registrar gastos en esa categoría.');
      return null;
    }
    try {
      const result = await registros.addGasto(data);
      showUndoToast({
        message: 'Gasto registrado',
        detail: `-S/ ${data.monto.toFixed(2)} — ${data.motivo}${data.pagadoA?.trim() ? ` · ${data.pagadoA.trim()}` : ''}`,
        undoAction: undoCreateGasto(result, (id) => registros.deleteGasto(id)),
      });
      return result;
    } catch (e) {
      toastHook.error('No se pudo registrar el gasto', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleAddMantenimiento = (data: Omit<Mantenimiento, 'id' | 'createdAt'>) => {
    const result = registros.addMantenimiento(data);
    toastHook.success('🔧 Mantenimiento registrado', `${data.nombres} — S/ ${data.costo.toFixed(2)}`);
    return result;
  };

  const handleAddDocumentacion = (data: Omit<Documentacion, 'id' | 'createdAt'>) => {
    const result = registros.addDocumentacion(data);
    toastHook.success('📋 Documentación registrada', data.motivo);
    return result;
  };

  const handleAddDescuento = (data: Omit<Descuento, 'id' | 'createdAt'>) => {
    const result = registros.addDescuento(data);
    const abs = Math.abs(data.monto);
    toastHook.success(
      '🏷️ Descuento registrado',
      `Rebaja S/ ${abs.toFixed(2)} — ${data.categoria.replace(/_/g, ' ')}`,
    );
    return result;
  };

  const handleAddPrestamo = (data: Omit<Prestamo, 'id' | 'createdAt'>) => {
    const result = registros.addPrestamo(data);
    toastHook.success(
      '🏦 Préstamo registrado',
      `${data.acreedor} — ${data.moneda === 'USD' ? 'US$' : 'S/'} ${data.monto.toFixed(2)} @ ${data.tasaInteresAnualPct}% anual`,
    );
    return result;
  };

  const handleAddPrestamoAbono = (data: Omit<PrestamoAbono, 'id' | 'createdAt'>) => {
    const result = registros.addPrestamoAbono(data);
    if (!result) {
      toastHook.error('Abono no registrado', 'Revisa préstamo activo, moneda y monto ≤ saldo.');
      return null;
    }
    toastHook.success(
      '✅ Abono a préstamo',
      `${data.moneda === 'USD' ? 'US$' : 'S/'} ${data.monto.toFixed(2)}`,
    );
    return result;
  };

  const handleAddUnidad = async (data: Omit<UnidadRegistro, 'id' | 'createdAt'>) => {
    try {
      const result = await registros.addUnidad(data);
      toastHook.success('🚘 Unidad registrada', `${data.detalleAuto} · ${data.placa}`);
      return result;
    } catch (e) {
      toastHook.error('No se pudo registrar la unidad', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleAddConductor = async (data: Omit<Conductor, 'id' | 'createdAt'>) => {
    try {
      const result = await registros.addConductor(data);
      showUndoToast({
        message: 'Conductor registrado',
        detail: `${data.nombres} ${data.apellidos}`,
        undoAction: undoCreateConductor(result, (id) => registros.deleteConductor(id)),
      });
      return result;
    } catch (e) {
      toastHook.error('No se pudo registrar el conductor', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleUpdateConductor = async (id: string, patch: Partial<Omit<Conductor, 'id' | 'createdAt'>>) => {
    const before = registros.conductores.find((c) => c.id === id);
    try {
      const result = await registros.updateConductor(id, patch);
      if (!result) {
        toastHook.error(
          'No se pudo actualizar',
          'Conductor no encontrado, ID inválido o error en Supabase. Revisa la consola (F12).',
        );
        return null;
      }
      if (before) {
        showUndoToast({
          message: 'Conductor actualizado',
          detail: `${result.nombres} ${result.apellidos}`,
          undoAction: undoUpdateConductor(before, registros.upsertConductor),
        });
      } else {
        toastHook.success('Conductor actualizado', `${result.nombres} ${result.apellidos}`);
      }
      return result;
    } catch (e) {
      toastHook.error('No se pudo actualizar', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleDeleteIngreso = async (id: string): Promise<boolean> => {
    if (!canMutateIngresos(role)) {
      toastHook.error('No tienes permiso para eliminar ingresos');
      return false;
    }
    const snapshot = registros.ingresos.find((i) => i.id === id);
    try {
      await registros.deleteIngreso(id);
      if (snapshot) {
        showUndoToast({
          message: 'Ingreso eliminado',
          undoAction: undoDeleteIngreso(snapshot, registros.upsertIngreso),
        });
      } else {
        toastHook.success('Ingreso eliminado');
      }
      return true;
    } catch (e) {
      toastHook.error('No se pudo eliminar el ingreso', e instanceof Error ? e.message : '');
      return false;
    }
  };

  const handleDeleteGasto = async (id: string): Promise<boolean> => {
    const snapshot = registros.gastos.find((g) => String(g.id) === String(id));
    try {
      await registros.deleteGasto(id);
      if (snapshot) {
        showUndoToast({
          message: 'Gasto eliminado',
          undoAction: undoDeleteGasto(snapshot, registros.upsertGasto),
        });
      }
      return true;
    } catch (e) {
      toastHook.error('No se pudo eliminar el gasto', e instanceof Error ? e.message : '');
      return false;
    }
  };

  const handleDeleteUnidad = async (id: string): Promise<boolean> => {
    try {
      await registros.deleteUnidad(id);
      return true;
    } catch (e) {
      toastHook.error('No se pudo eliminar la unidad', e instanceof Error ? e.message : '');
      return false;
    }
  };

  const handleDeleteConductor = async (id: string): Promise<boolean> => {
    const snapshot = registros.conductores.find((c) => c.id === id);
    try {
      await registros.deleteConductor(id);
      if (snapshot) {
        showUndoToast({
          message: 'Conductor eliminado',
          detail: `${snapshot.nombres} ${snapshot.apellidos}`,
          undoAction: undoDeleteConductor(snapshot, registros.upsertConductor),
        });
      }
      return true;
    } catch (e) {
      toastHook.error('No se pudo eliminar el conductor', e instanceof Error ? e.message : '');
      return false;
    }
  };

  const handleAddControlFecha = async (data: Omit<ControlFecha, 'id' | 'createdAt'>) => {
    try {
      const result = await registros.addControlFecha(data);
      if (result) {
        toastHook.success(
          '🗓️ Control de fecha guardado',
          `${data.tipo} · vence ${data.fechaVencimiento} · id ${result.id} (búscalo en la lista de abajo o en Supabase por id).`,
        );
      }
      return result;
    } catch (e) {
      toastHook.error('No se pudo registrar la fecha', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleAddKilometraje = async (data: Omit<KilometrajeRegistro, 'id' | 'createdAt'>) => {
    try {
      const result = await registros.addKilometraje(data);
      if (result) {
        showUndoToast({
          message: 'Kilometraje registrado',
          detail: `Auto #${data.vehicleId}`,
          undoAction: undoCreateKilometraje(result, (id) => registros.deleteKilometraje(id)),
        });
      }
      return result;
    } catch (e) {
      toastHook.error('No se pudo registrar el kilometraje', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleDeleteControlFecha = async (id: number): Promise<boolean> => {
    try {
      await registros.deleteControlFecha(id);
      return true;
    } catch (e) {
      toastHook.error('No se pudo eliminar', e instanceof Error ? e.message : '');
      return false;
    }
  };

  const handleDeleteKilometraje = async (id: number): Promise<boolean> => {
    const snapshot = registros.kilometrajes.find((k) => k.id === id);
    try {
      await registros.deleteKilometraje(id);
      if (snapshot) {
        showUndoToast({
          message: 'Kilometraje eliminado',
          detail: `Auto #${snapshot.vehicleId}`,
          undoAction: undoDeleteKilometraje(snapshot, registros.mergeKilometraje),
        });
      }
      return true;
    } catch (e) {
      toastHook.error('No se pudo eliminar', e instanceof Error ? e.message : '');
      return false;
    }
  };

  const handleAddPendiente = async (data: Omit<Pendiente, 'id' | 'createdAt'>) => {
    try {
      const result = await registros.addPendiente(data);
      if (result) {
        showUndoToast({
          message: 'Pendiente registrado',
          detail: data.descripcion.slice(0, 80),
          undoAction: undoCreatePendiente(result, (pid) => registros.deletePendiente(pid)),
        });
      }
      return result;
    } catch (e) {
      toastHook.error('No se pudo guardar el pendiente', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleUpdatePendiente = async (
    id: number,
    patch: Partial<Omit<Pendiente, 'id' | 'createdAt'>>,
  ) => {
    const before = registros.pendientes.find((p) => p.id === id);
    try {
      const result = await registros.updatePendiente(id, patch);
      if (!result) {
        toastHook.error('No se pudo actualizar', 'Registro no encontrado o error en Supabase.');
        return null;
      }
      if (before) {
        showUndoToast({
          message: 'Pendiente actualizado',
          detail: before.descripcion.slice(0, 60),
          undoAction: undoUpdatePendiente(before, registros.mergePendiente),
        });
      }
      return result;
    } catch (e) {
      toastHook.error('No se pudo actualizar', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleDeletePendiente = async (id: number): Promise<boolean> => {
    const snapshot = registros.pendientes.find((p) => p.id === id);
    try {
      await registros.deletePendiente(id);
      if (snapshot) {
        showUndoToast({
          message: 'Pendiente eliminado',
          undoAction: undoDeletePendiente(snapshot, registros.mergePendiente),
        });
      }
      return true;
    } catch (e) {
      toastHook.error('No se pudo eliminar', e instanceof Error ? e.message : '');
      return false;
    }
  };

  const handleAddRegistroTiempo = async (data: Omit<RegistroTiempo, 'id' | 'createdAt'>) => {
    try {
      const result = await registros.addRegistroTiempo(data);
      if (result) {
        toastHook.success('⏱️ Registro TIEMPO guardado', `${data.fecha} · ${data.tipo ?? 'sin tipo'}`);
      }
      return result;
    } catch (e) {
      toastHook.error('No se pudo guardar', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleUpdateRegistroTiempo = async (
    id: number,
    patch: Partial<Omit<RegistroTiempo, 'id' | 'createdAt'>>,
  ) => {
    try {
      const result = await registros.updateRegistroTiempo(id, patch);
      if (!result) {
        toastHook.error('No se pudo actualizar', 'Registro no encontrado o error en Supabase.');
        return null;
      }
      toastHook.success('Registro actualizado', result.fecha);
      return result;
    } catch (e) {
      toastHook.error('No se pudo actualizar', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleDeleteRegistroTiempo = async (id: number): Promise<boolean> => {
    try {
      await registros.deleteRegistroTiempo(id);
      return true;
    } catch (e) {
      toastHook.error('No se pudo eliminar', e instanceof Error ? e.message : '');
      return false;
    }
  };

  return (
    <RegistrosContext.Provider value={{
      vehicles: registros.vehicles,
      ingresos: registros.ingresos,
      gastos: visibleGastos,
      gastosPendientesRevision: registros.gastosPendientesRevision.filter((g) =>
        canViewGastoTipo(permissionUser, g.tipo_gasto ?? null),
      ),
      descuentos: registros.descuentos,
      prestamos: registros.prestamos,
      prestamoAbonos: registros.prestamoAbonos,
      unidades: registros.unidades,
      conductores: registros.conductores,
      controlFechas: registros.controlFechas,
      controlFechasHistory: registros.controlFechasHistory,
      controlFechasHistoryTotal: registros.controlFechasHistoryTotal,
      controlFechasHistoryPage: registros.controlFechasHistoryPage,
      controlFechasHistoryPageSize: registros.controlFechasHistoryPageSize,
      controlFechasHistoryLoading: registros.controlFechasHistoryLoading,
      loadControlFechasHistory: registros.loadControlFechasHistory,
      kilometrajes: registros.kilometrajes,
      pendientes: registros.pendientes,
      registrosTiempo: registros.registrosTiempo,
      inversionesVehiculo: registros.inversionesVehiculo,
      gastosCaja: registros.gastosCaja,
      cajaNegocioVehiculo: registros.cajaNegocioVehiculo,
      mantenimientos: registros.mantenimientos,
      documentaciones: registros.documentaciones,
      addIngreso: handleAddIngreso,
      addGasto: handleAddGasto,
      addDescuento: handleAddDescuento,
      addPrestamo: handleAddPrestamo,
      addPrestamoAbono: handleAddPrestamoAbono,
      addUnidad: handleAddUnidad,
      addConductor: handleAddConductor,
      updateConductor: handleUpdateConductor,
      addControlFecha: handleAddControlFecha,
      addKilometraje: handleAddKilometraje,
      addPendiente: handleAddPendiente,
      updatePendiente: handleUpdatePendiente,
      deletePendiente: handleDeletePendiente,
      addRegistroTiempo: handleAddRegistroTiempo,
      updateRegistroTiempo: handleUpdateRegistroTiempo,
      deleteRegistroTiempo: handleDeleteRegistroTiempo,
      addMantenimiento: handleAddMantenimiento,
      addDocumentacion: handleAddDocumentacion,
      deleteIngreso: handleDeleteIngreso,
      deleteGasto: handleDeleteGasto,
      upsertGasto: registros.upsertGasto,
      upsertIngreso: registros.upsertIngreso,
      deleteDescuento: registros.deleteDescuento,
      deletePrestamo: registros.deletePrestamo,
      deleteUnidad: handleDeleteUnidad,
      deleteConductor: handleDeleteConductor,
      deleteControlFecha: handleDeleteControlFecha,
      deleteKilometraje: handleDeleteKilometraje,
      getVehicleLabel: registros.getVehicleLabel,
      getVehicleById: registros.getVehicleById,
      toasts: toastHook.toasts,
      removeToast: toastHook.removeToast,
      toast: {
        success: toastHook.success,
        error: toastHook.error,
        warning: toastHook.warning,
        info: toastHook.info,
      },
      showUndoToast,
      refreshFromSupabase: registros.refreshFromSupabase,
      reloadGastosOnly: registros.reloadGastosOnly,
      reloadGastosFull: registros.reloadGastosFull,
      gastosLoadScope: registros.gastosLoadScope,
      isLoadingGastosFull: registros.isLoadingGastosFull,
      gastosFinancialSummary: registros.gastosFinancialSummary,
      isLoadingGastosSummary: registros.isLoadingGastosSummary,
      reloadGastosFinancialSummary: registros.reloadGastosFinancialSummary,
      reloadIngresosOnly: registros.reloadIngresosOnly,
      reloadKilometrajesOnly: registros.reloadKilometrajesOnly,
      reloadPendientesOnly: registros.reloadPendientesOnly,
      reloadControlFechasLatest: registros.reloadControlFechasLatest,
      registrosBootstrapComplete: registros.registrosBootstrapComplete,
      registrosBootstrapLoading: registros.registrosBootstrapLoading,
      isBootstrapLoading:
        registros.registrosBootstrapLoading && !registros.registrosBootstrapComplete,
      registrosBootstrapStarted: registros.registrosBootstrapStarted,
      isLoadingGastos: registros.isLoadingGastos,
      hasLoadedGastosOnce: registros.hasLoadedGastosOnce,
      registrosRealtimeConnected,
      gastosRealtimeConnected: registrosRealtimeConnected,
    }}>
      {children}
    </RegistrosContext.Provider>
  );
};

export const useRegistrosContext = () => {
  const ctx = useContext(RegistrosContext);
  if (!ctx) throw new Error('useRegistrosContext must be used within RegistrosProvider');
  return ctx;
};
