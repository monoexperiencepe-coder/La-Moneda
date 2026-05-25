import type { AppUserProfile, Vehicle } from '../../data/types';
import type { IaPendienteSugerencia } from '../../modules/ai/iaClasificacionTypes';
import type { IaLoteApplyItemResult, IaLoteApplySummary } from '../../utils/iaClasificacionLote';
import { applyIaClasificacionSugerencia, insertIaClasificacionAudit } from './iaClasificacionService';

export type IaLoteProgress = {
  batchId: string;
  current: number;
  total: number;
  gastoId: number | null;
};

/** Aplica sugerencias en lote, una por una, con el mismo flujo seguro que aplicación individual. */
export async function applyIaClasificacionLote(params: {
  rows: IaPendienteSugerencia[];
  user: AppUserProfile;
  email: string | null | undefined;
  empresaId: string;
  vehicles: Vehicle[];
  operatorClassifyMode?: boolean;
  onProgress?: (p: IaLoteProgress) => void;
}): Promise<IaLoteApplySummary> {
  const { rows, user, email, empresaId, vehicles, operatorClassifyMode, onProgress } = params;
  const batchId = crypto.randomUUID();
  const total = rows.length;
  const items: IaLoteApplyItemResult[] = [];
  let exitos = 0;
  let fallos = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    onProgress?.({ batchId, current: i + 1, total, gastoId: row.id });

    const res = await applyIaClasificacionSugerencia({
      row,
      user,
      email,
      empresaId,
      vehicles,
      operatorClassifyMode,
      batchId,
    });

    if (res.ok) {
      exitos += 1;
      items.push({
        gastoId: row.id,
        ok: true,
        removeFromList: res.removeFromIaList,
        tipoAplicado: res.tipoAplicado,
        subtipoAplicado: res.subtipoAplicado,
        feedback: res.feedback,
        gastoBefore: res.gastoBefore,
        gasto: res.gasto,
        movedOutOfView: res.movedOutOfView,
      });
    } else {
      fallos += 1;
      items.push({ gastoId: row.id, ok: false, message: res.message });
    }
  }

  const resumenJson = JSON.stringify({
    batch_id: batchId,
    total,
    exitos,
    fallos,
    items: items.map((it) =>
      it.ok
        ? { gasto_id: it.gastoId, ok: true, tipo: it.tipoAplicado, subtipo: it.subtipoAplicado }
        : { gasto_id: it.gastoId, ok: false, error: it.message },
    ),
  }).slice(0, 4000);

  await insertIaClasificacionAudit(
    {
      action: 'lote_completado',
      batchId,
      razon: resumenJson,
      aplicadoManual: true,
      userRole: user.role,
    },
    empresaId,
  );

  onProgress?.({ batchId, current: total, total, gastoId: null });

  return { batchId, total, exitos, fallos, items };
}
