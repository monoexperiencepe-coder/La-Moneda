/**
 * Alias de ingresos sobre cleanOperationalComment (compatibilidad).
 */
import {
  cleanOperationalCommentForUi,
  isOnlyTechnicalImportComment,
  operationalCommentAuditRaw,
} from './cleanOperationalComment';

export const cleanIngresoComentarioParaUi = cleanOperationalCommentForUi;
export const isTechnicalImportComment = isOnlyTechnicalImportComment;

export function ingresoComentarioParaLista(raw: string | null | undefined): string | null {
  return cleanOperationalCommentForUi(raw);
}

export function cleanIngresoDetalleOperativoParaUi(raw: string | null | undefined): string | null {
  return cleanOperationalCommentForUi(raw);
}

export function ingresoComentarioAuditRaw(
  comentarios: string | null | undefined,
  detalleOperativo?: string | null,
): string | null {
  return operationalCommentAuditRaw(comentarios, detalleOperativo);
}
