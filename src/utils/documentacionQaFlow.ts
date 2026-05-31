/** Metadatos del flujo QA/E2E de documentación (solo lectura). */
export function auditDocumentacionQaFlowMeta(): {
  route: string;
  table: string;
  requiredFields: string[];
  supportsCreate: boolean;
  supportsEdit: boolean;
  supportsDelete: boolean;
  supportsUndo: boolean;
  usesFileAttachments: boolean;
  cleanupStrategy: string;
  qaMarkerField: string;
} {
  return {
    route: '/operaciones/docs',
    table: 'control_fechas',
    requiredFields: [
      'vehicle_id (vehículo activo)',
      'tipo (SOAT, RT, OTRO_VENCIMIENTO, …)',
      'fecha_vencimiento',
      'comentarios (usar prefijo [QA_AUTO] doc …)',
    ],
    supportsCreate: true,
    supportsEdit: true,
    supportsDelete: true,
    supportsUndo: false,
    usesFileAttachments: false,
    cleanupStrategy:
      'DELETE API en control_fechas con comentarios [QA_AUTO]; luego vehículos QA* si se crearon para el test',
    qaMarkerField: 'comentarios',
  };
}
