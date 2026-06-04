/**
 * Resumen de pendientes operativos del equipo (tabla pendientes).
 * NO reutiliza gastos ni pendiente_revision.
 */
import { fetchPendientes } from '../../services/pendientesService';
import type { Pendiente } from '../../data/types';

export type PendientesResumenPayload = {
  totalPendientes: number;
  activos: number;
  abiertos: number;
  enCurso: number;
  resueltos: number;
  cancelados: number;
  alta: number;
  media: number;
  baja: number;
  mostrarEnHoy: number;
  fuente: string;
  nota: string;
};

function countByEstado(rows: Pendiente[]) {
  let abiertos = 0;
  let enCurso = 0;
  let resueltos = 0;
  let cancelados = 0;
  for (const p of rows) {
    if (p.estado === 'ABIERTO') abiertos += 1;
    else if (p.estado === 'EN_CURSO') enCurso += 1;
    else if (p.estado === 'RESUELTO') resueltos += 1;
    else if (p.estado === 'CANCELADO') cancelados += 1;
  }
  return { abiertos, enCurso, resueltos, cancelados, activos: abiertos + enCurso };
}

function countByPrioridad(rows: Pendiente[]) {
  let alta = 0;
  let media = 0;
  let baja = 0;
  for (const p of rows) {
    if (p.prioridad === 'ALTA') alta += 1;
    else if (p.prioridad === 'MEDIA') media += 1;
    else if (p.prioridad === 'BAJA') baja += 1;
  }
  return { alta, media, baja };
}

export async function buildPendientesResumenPayload(
  empresaId: string,
): Promise<PendientesResumenPayload> {
  const rows = await fetchPendientes(empresaId);
  const byEstado = countByEstado(rows);
  const byPrioridad = countByPrioridad(rows);
  const mostrarEnHoy = rows.filter((p) => p.mostrarEnHoy).length;

  return {
    totalPendientes: rows.length,
    activos: byEstado.activos,
    abiertos: byEstado.abiertos,
    enCurso: byEstado.enCurso,
    resueltos: byEstado.resueltos,
    cancelados: byEstado.cancelados,
    alta: byPrioridad.alta,
    media: byPrioridad.media,
    baja: byPrioridad.baja,
    mostrarEnHoy,
    fuente: 'public.pendientes',
    nota: 'Pendientes operativos del equipo. NO incluye gastos pendiente_revision.',
  };
}
