/**
 * Resumen de documentación operativa (control de fechas por vehículo).
 */
import { DOC_MODULE_UI_COLUMNS } from '../../data/controlFechaCatalog';
import { fetchLatestControlFechasByVehicle } from '../../services/controlFechasService';
import { fetchVehiculos } from '../../services/vehiculosService';
import { buildControlFechasPivotMapByTipos } from '../../utils/controlFechasPivot';
import { docColumnTone } from '../../utils/documentacionDocTone';
import {
  ALERTAS_CRITERIO_OPERATIVO,
  DOCUMENTOS_CRITERIO_INVENTARIO,
} from './documentosExtendedTool';

export type DocumentosResumenPayload = {
  totalDocumentos: number;
  vencidos: number;
  porVencer: number;
  vigentes: number;
  sinDato: number;
  vehiculosActivos: number;
  fuente: string;
  criterio: string;
  notaComparacionAlertas: string;
  prohibido_inventar: string;
  nota: string;
};

export async function buildDocumentosResumenPayload(
  empresaId: string,
): Promise<DocumentosResumenPayload> {
  const [vehicles, controlFechas] = await Promise.all([
    fetchVehiculos(empresaId),
    fetchLatestControlFechasByVehicle(empresaId),
  ]);

  const tipos = DOC_MODULE_UI_COLUMNS.map((c) => c.tipo);
  const pivot = buildControlFechasPivotMapByTipos(controlFechas, tipos);
  const activos = vehicles.filter((v) => v.activo);

  let totalDocumentos = 0;
  let vencidos = 0;
  let porVencer = 0;
  let vigentes = 0;
  let sinDato = 0;

  for (const v of activos) {
    const doc = pivot.get(v.id);
    for (const { tipo } of DOC_MODULE_UI_COLUMNS) {
      const tone = docColumnTone(doc?.[tipo], tipo);
      if (tone === 'empty') {
        sinDato += 1;
        continue;
      }
      if (tone === 'neutral' || tone === 'mant') continue;
      totalDocumentos += 1;
      if (tone === 'late') vencidos += 1;
      else if (tone === 'soon') porVencer += 1;
      else if (tone === 'ok') vigentes += 1;
    }
  }

  return {
    totalDocumentos,
    vencidos,
    porVencer,
    vigentes,
    sinDato,
    vehiculosActivos: activos.length,
    fuente: 'public.control_fechas + módulo Documentación',
    criterio: DOCUMENTOS_CRITERIO_INVENTARIO,
    notaComparacionAlertas: ALERTAS_CRITERIO_OPERATIVO,
    prohibido_inventar:
      'No inventar alertas desactivadas/resueltas: esos estados no existen en los datos. Si los conteos difieren con alertas, explicar: Documentación = inventario completo; Alertas = criterios de Qué hacer hoy.',
    nota:
      'totalDocumentos = celdas con fecha y semáforo de vencimiento (excl. GNV instalación, BAT compra, BAT mant.). sinDato = celdas vacías.',
  };
}
