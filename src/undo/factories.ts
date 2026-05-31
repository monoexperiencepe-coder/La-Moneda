import type { Conductor, Gasto, Ingreso, KilometrajeRegistro, Pendiente } from '../data/types';
import { insertConductor, patchConductor, removeConductor } from '../services/conductoresService';
import { insertKilometraje, removeKilometraje } from '../services/kilometrajesService';
import { insertPendiente, patchPendiente, removePendiente } from '../services/pendientesService';
import {
  insertGasto,
  updateGastoDetalleManual,
  type GastoDetalleManualPatch,
} from '../services/gastosService';
import { insertIngreso, removeIngreso } from '../services/ingresosService';
import {
  deletePrestamoFinanciero,
  restorePrestamoFinancieroDetalle,
  revertirMovimientoPrestamo,
} from '../services/prestamosFinancierosService';
import { insertAporteAccionista, deleteAporteAccionista } from '../services/aportesAccionistasService';
import type { AporteAccionista, PrestamoFinancieroDetalle } from '../data/types';
import {
  omitConductorIds,
  omitGastoIds,
  omitIngresoIds,
  omitKilometrajeIds,
  omitPendienteIds,
} from '../utils/entityReinsertPayloads';
import type { RegisterUndoInput } from './types';

type LocalUpsert<T> = (row: T) => void;
type LocalDelete = (id: string) => Promise<void>;

/** CREATE → undo elimina el registro creado. */
export function undoCreateGasto(
  created: Gasto,
  deleteLocal: LocalDelete,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'create',
    label: 'Gasto registrado',
    entityType: 'gasto',
    entityId: String(created.id),
    undo: async () => {
      await deleteLocal(String(created.id));
    },
  };
}

export function undoCreateIngreso(
  created: Ingreso,
  deleteLocal: LocalDelete,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'create',
    label: 'Ingreso registrado',
    entityType: 'ingreso',
    entityId: String(created.id),
    undo: async () => {
      const res = await removeIngreso(String(created.id));
      if (!res.ok) throw new Error('undo_failed');
      await deleteLocal(String(created.id));
    },
  };
}

export function undoCreateConductor(
  created: Conductor,
  deleteLocal: LocalDelete,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'create',
    label: 'Conductor registrado',
    entityType: 'conductor',
    entityId: created.id,
    undo: async () => {
      const ok = await removeConductor(created.id);
      if (!ok) throw new Error('undo_failed');
      await deleteLocal(created.id);
    },
  };
}

/** DELETE → undo recrea desde snapshot (nuevo id en Supabase). */
export function undoDeleteGasto(
  snapshot: Gasto,
  upsertLocal: LocalUpsert<Gasto>,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'delete',
    label: 'Gasto eliminado',
    entityType: 'gasto',
    entityId: String(snapshot.id),
    undo: async () => {
      const restored = await insertGasto(omitGastoIds(snapshot));
      if (!restored) throw new Error('undo_failed');
      upsertLocal(restored);
    },
  };
}

export function undoDeleteIngreso(
  snapshot: Ingreso,
  upsertLocal: LocalUpsert<Ingreso>,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'delete',
    label: 'Ingreso eliminado',
    entityType: 'ingreso',
    entityId: String(snapshot.id),
    undo: async () => {
      const restored = await insertIngreso(omitIngresoIds(snapshot));
      if (!restored) throw new Error('undo_failed');
      upsertLocal(restored);
    },
  };
}

export function undoDeleteConductor(
  snapshot: Conductor,
  mergeLocal: (c: Conductor) => void,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'delete',
    label: 'Conductor eliminado',
    entityType: 'conductor',
    entityId: snapshot.id,
    undo: async () => {
      const restored = await insertConductor(omitConductorIds(snapshot));
      if (!restored) throw new Error('undo_failed');
      mergeLocal(restored);
    },
  };
}

/** UPDATE → undo restaura snapshot anterior (mismo id). */
export function undoUpdateConductor(
  before: Conductor,
  mergeLocal: (c: Conductor) => void,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'update',
    label: 'Conductor actualizado',
    entityType: 'conductor',
    entityId: before.id,
    undo: async () => {
      const restored = await patchConductor(before.id, omitConductorIds(before));
      if (!restored) throw new Error('undo_failed');
      mergeLocal(restored);
    },
  };
}

function normalizeVehicleIdForDetallePatch(v: Gasto['vehicleId']): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function gastoDetallePatchFromRow(g: Gasto): GastoDetalleManualPatch {
  return {
    fecha: g.fecha,
    fechaRegistro: g.fechaRegistro,
    vehicleId: normalizeVehicleIdForDetallePatch(g.vehicleId),
    subtipo_gasto: g.subtipo_gasto,
    tipo: g.tipo,
    subTipo: g.subTipo,
    categoria: g.categoria,
    motivo: g.motivo,
    metodoPago: g.metodoPago,
    metodoPagoDetalle: g.metodoPagoDetalle,
    monto: g.monto,
    comentarios: g.comentarios,
    revisado_at: g.revisado_at ?? null,
    revisado_por: g.revisado_por ?? null,
  };
}

/** UPDATE detalle manual → restaura snapshot anterior del gasto. */
export function undoCreateKilometraje(
  created: KilometrajeRegistro,
  deleteLocal: (id: number) => Promise<void>,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'create',
    label: 'Kilometraje registrado',
    entityType: 'kilometraje',
    entityId: String(created.id),
    undo: async () => {
      const ok = await removeKilometraje(created.id);
      if (!ok) throw new Error('undo_failed');
      await deleteLocal(created.id);
    },
  };
}

export function undoDeleteKilometraje(
  snapshot: KilometrajeRegistro,
  mergeLocal: (row: KilometrajeRegistro) => void,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'delete',
    label: 'Kilometraje eliminado',
    entityType: 'kilometraje',
    entityId: String(snapshot.id),
    undo: async () => {
      const restored = await insertKilometraje(omitKilometrajeIds(snapshot));
      if (!restored) throw new Error('undo_failed');
      mergeLocal(restored);
    },
  };
}

export function undoCreatePendiente(
  created: Pendiente,
  deleteLocal: (id: number) => Promise<void>,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'create',
    label: 'Pendiente registrado',
    entityType: 'pendiente',
    entityId: String(created.id),
    undo: async () => {
      const ok = await removePendiente(created.id);
      if (!ok) throw new Error('undo_failed');
      await deleteLocal(created.id);
    },
  };
}

export function undoDeletePendiente(
  snapshot: Pendiente,
  mergeLocal: (row: Pendiente) => void,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'delete',
    label: 'Pendiente eliminado',
    entityType: 'pendiente',
    entityId: String(snapshot.id),
    undo: async () => {
      const restored = await insertPendiente(omitPendienteIds(snapshot));
      if (!restored) throw new Error('undo_failed');
      mergeLocal(restored);
    },
  };
}

export function undoUpdatePendiente(
  before: Pendiente,
  mergeLocal: (row: Pendiente) => void,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'update',
    label: 'Pendiente actualizado',
    entityType: 'pendiente',
    entityId: String(before.id),
    undo: async () => {
      const restored = await patchPendiente(before.id, omitPendienteIds(before));
      if (!restored) throw new Error('undo_failed');
      mergeLocal(restored);
    },
  };
}

export function undoUpdateGastoDetalle(
  before: Gasto,
  upsertLocal: LocalUpsert<Gasto>,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'update',
    label: 'Gasto actualizado',
    entityType: 'gasto',
    entityId: String(before.id),
    undo: async () => {
      const res = await updateGastoDetalleManual(String(before.id), gastoDetallePatchFromRow(before));
      if (!res.ok) throw new Error('undo_failed');
      upsertLocal(res.gasto);
    },
  };
}

export function undoCreatePrestamoFinanciero(
  prestamoId: number,
  removeLocal: (id: number) => void,
  tenantEmpresaId?: string | null,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'create',
    label: 'Préstamo registrado',
    entityType: 'prestamo',
    entityId: String(prestamoId),
    undo: async () => {
      const { error } = await deletePrestamoFinanciero(prestamoId, tenantEmpresaId);
      if (error) throw new Error(error);
      removeLocal(prestamoId);
    },
  };
}

export function undoDeletePrestamoFinanciero(
  snapshot: PrestamoFinancieroDetalle,
  upsertLocal: (row: PrestamoFinancieroDetalle) => void,
  removeLocal: (id: number) => void,
  tenantEmpresaId?: string | null,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'delete',
    label: 'Préstamo eliminado',
    entityType: 'prestamo',
    entityId: String(snapshot.prestamo.id),
    undo: async () => {
      const { detalle, error } = await restorePrestamoFinancieroDetalle(snapshot, tenantEmpresaId);
      if (error || !detalle) throw new Error(error ?? 'undo_failed');
      removeLocal(snapshot.prestamo.id);
      upsertLocal(detalle);
    },
  };
}

export function undoUpdatePrestamoFinanciero(
  before: PrestamoFinancieroDetalle,
  newTramoId: number | null,
  upsertLocal: (row: PrestamoFinancieroDetalle) => void,
  tenantEmpresaId?: string | null,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  const prestamoId = before.prestamo.id;
  return {
    type: 'update',
    label: 'Préstamo actualizado',
    entityType: 'prestamo',
    entityId: String(prestamoId),
    undo: async () => {
      const { error } = await revertirMovimientoPrestamo(prestamoId, before, newTramoId, tenantEmpresaId);
      if (error) throw new Error(error);
      upsertLocal(before);
    },
  };
}

export function undoDeleteAporte(
  snapshot: AporteAccionista,
  mergeLocal: (row: AporteAccionista) => void,
  removeLocal: (id: string) => void,
  tenantEmpresaId?: string | null,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  const esRetiro = String(snapshot.tipo ?? '').trim() === 'retiro_accionista';
  return {
    type: 'delete',
    label: esRetiro ? 'Retiro eliminado' : 'Aporte eliminado',
    entityType: 'aporte',
    entityId: snapshot.id,
    undo: async () => {
      const { error, row } = await insertAporteAccionista(
        {
          accionista: snapshot.accionista,
          vehiculoReferencia: snapshot.vehiculoReferencia,
          monto: snapshot.monto,
          moneda: snapshot.moneda,
          fechaAporte: snapshot.fechaAporte,
          generaInteres: snapshot.generaInteres,
          tipo: snapshot.tipo,
          observaciones: snapshot.observaciones,
        },
        tenantEmpresaId,
      );
      if (error || !row) throw new Error(error ?? 'undo_failed');
      removeLocal(snapshot.id);
      mergeLocal(row);
    },
  };
}

export function undoCreateAporte(
  created: AporteAccionista,
  removeLocal: (id: string) => void,
  tenantEmpresaId?: string | null,
): Pick<RegisterUndoInput, 'type' | 'label' | 'entityType' | 'entityId' | 'undo'> {
  return {
    type: 'create',
    label: 'Aporte registrado',
    entityType: 'aporte',
    entityId: created.id,
    undo: async () => {
      const { error } = await deleteAporteAccionista(created.id, tenantEmpresaId);
      if (error) throw new Error(error);
      removeLocal(created.id);
    },
  };
}
