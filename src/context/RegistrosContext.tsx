import React, { createContext, useContext, ReactNode } from 'react';
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
} from '../data/types';
import { ingresoMontoPEN } from '../utils/moneda';

interface RegistrosContextValue {
  vehicles: Vehicle[];
  ingresos: Ingreso[];
  gastos: Gasto[];
  descuentos: Descuento[];
  prestamos: Prestamo[];
  prestamoAbonos: PrestamoAbono[];
  unidades: UnidadRegistro[];
  conductores: Conductor[];
  controlFechas: ControlFecha[];
  kilometrajes: KilometrajeRegistro[];
  pendientes: Pendiente[];
  registrosTiempo: RegistroTiempo[];
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
    id: number,
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
  deleteIngreso: (id: number) => Promise<boolean>;
  deleteGasto: (id: number) => Promise<boolean>;
  deleteDescuento: (id: number) => void;
  deletePrestamo: (id: number) => void;
  deleteUnidad: (id: string) => Promise<boolean>;
  deleteConductor: (id: number) => Promise<boolean>;
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
}

const RegistrosContext = createContext<RegistrosContextValue | null>(null);

export const RegistrosProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const registros = useRegistros();
  const toastHook = useToast();

  const handleAddIngreso = async (data: Omit<Ingreso, 'id' | 'createdAt'>) => {
    try {
      const result = await registros.addIngreso(data);
      const ref = ingresoMontoPEN(result);
      const moneda = data.moneda ?? 'PEN';
      const msg =
        moneda === 'USD'
          ? `US$ ${data.monto.toFixed(2)} (≈ S/ ${ref.toFixed(2)}) — ${data.tipo}`
          : `+S/ ${ref.toFixed(2)} — ${data.tipo}`;
      toastHook.success('💰 Ingreso registrado', msg);
      return result;
    } catch (e) {
      toastHook.error('No se pudo registrar el ingreso', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleAddGasto = async (data: Omit<Gasto, 'id' | 'createdAt'>) => {
    try {
      const result = await registros.addGasto(data);
      toastHook.success(
        '💸 Gasto registrado',
        `-S/ ${data.monto.toFixed(2)} — ${data.motivo}${data.pagadoA?.trim() ? ` · ${data.pagadoA.trim()}` : ''}`,
      );
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
      toastHook.success('👤 Conductor registrado', `${data.nombres} ${data.apellidos}`);
      return result;
    } catch (e) {
      toastHook.error('No se pudo registrar el conductor', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleUpdateConductor = async (id: number, patch: Partial<Omit<Conductor, 'id' | 'createdAt'>>) => {
    try {
      const result = await registros.updateConductor(id, patch);
      if (!result) {
        toastHook.error('No se pudo actualizar', 'Conductor no encontrado o error en Supabase.');
        return null;
      }
      toastHook.success('Conductor actualizado', `${result.nombres} ${result.apellidos}`);
      return result;
    } catch (e) {
      toastHook.error('No se pudo actualizar', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleDeleteIngreso = async (id: number): Promise<boolean> => {
    try {
      await registros.deleteIngreso(id);
      return true;
    } catch (e) {
      toastHook.error('No se pudo eliminar el ingreso', e instanceof Error ? e.message : '');
      return false;
    }
  };

  const handleDeleteGasto = async (id: number): Promise<boolean> => {
    try {
      await registros.deleteGasto(id);
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

  const handleDeleteConductor = async (id: number): Promise<boolean> => {
    try {
      await registros.deleteConductor(id);
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
        toastHook.success('🗓️ Control de fecha', `${data.tipo} · ${data.fechaVencimiento}`);
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
        toastHook.success('🛣️ Kilometraje registrado', `Auto #${data.vehicleId}`);
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
    try {
      await registros.deleteKilometraje(id);
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
        toastHook.success('📌 Pendiente registrado', data.descripcion.slice(0, 80));
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
    try {
      const result = await registros.updatePendiente(id, patch);
      if (!result) {
        toastHook.error('No se pudo actualizar', 'Registro no encontrado o error en Supabase.');
        return null;
      }
      return result;
    } catch (e) {
      toastHook.error('No se pudo actualizar', e instanceof Error ? e.message : '');
      return null;
    }
  };

  const handleDeletePendiente = async (id: number): Promise<boolean> => {
    try {
      await registros.deletePendiente(id);
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
      gastos: registros.gastos,
      descuentos: registros.descuentos,
      prestamos: registros.prestamos,
      prestamoAbonos: registros.prestamoAbonos,
      unidades: registros.unidades,
      conductores: registros.conductores,
      controlFechas: registros.controlFechas,
      kilometrajes: registros.kilometrajes,
      pendientes: registros.pendientes,
      registrosTiempo: registros.registrosTiempo,
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
