import type { Conductor, Gasto, Ingreso } from '../data/types';
import { insertConductor, patchConductor, removeConductor } from '../services/conductoresService';
import {
  insertGasto,
  removeGasto,
  updateGastoDetalleManual,
  type GastoDetalleManualPatch,
} from '../services/gastosService';
import { insertIngreso, removeIngreso } from '../services/ingresosService';
import { omitConductorIds, omitGastoIds, omitIngresoIds } from '../utils/entityReinsertPayloads';
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
      const ok = await removeGasto(String(created.id));
      if (!ok) throw new Error('undo_failed');
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
    tipo: g.tipo,
    subTipo: g.subTipo,
    categoria: g.categoria,
    motivo: g.motivo,
    metodoPago: g.metodoPago,
    metodoPagoDetalle: g.metodoPagoDetalle,
    monto: g.monto,
    comentarios: g.comentarios,
  };
}

/** UPDATE detalle manual → restaura snapshot anterior del gasto. */
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
