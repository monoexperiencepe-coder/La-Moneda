import { cleanOperationalCommentForUi } from './cleanOperationalComment';

/** Nota visible en listado gastos_caja (sin trazabilidad Excel/caja). */
export function gastoCajaComentarioParaLista(raw: string | null | undefined): string | null {
  return cleanOperationalCommentForUi(raw);
}
