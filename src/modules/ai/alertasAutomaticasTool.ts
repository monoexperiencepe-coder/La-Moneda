/**
 * Alertas automáticas — misma lógica que Home / Qué hacer hoy (computeTodayReview).
 */
import { fetchLatestControlFechasByVehicle } from '../../services/controlFechasService';
import { fetchIngresos } from '../../services/ingresosService';
import { fetchKilometrajes } from '../../services/kilometrajesService';
import { fetchPendientes } from '../../services/pendientesService';
import { fetchVehiculos } from '../../services/vehiculosService';
import { computeTodayReview, DIAS_ALERTA_SIN_INGRESO } from '../../utils/fleetPanel';
import { DOCUMENTOS_CRITERIO_INVENTARIO } from './documentosExtendedTool';

export type AlertasAutomaticasPayload = {
  totalAlertasAutomaticas: number;
  documentosVencidos: number;
  documentosPorVencer: number;
  sinIngresosRecientes: number;
  kmSinMantenimiento: number;
  pendientesAltaPrioridad: number;
  sinIngresoUmbralDias: number;
  count: number;
  fuente: string;
  criterio: string;
  notaComparacionDocumentacion: string;
  prohibido_inventar: string;
  preview: {
    documentosVencidos: string[];
    documentosPorVencer: string[];
    sinIngresosRecientes: string[];
    kmSinMantenimiento: string[];
    pendientesAltaPrioridad: string[];
  };
  nota: string;
};

function previewLine(placa: string, detail: string): string {
  return `${placa} — ${detail}`;
}

export async function buildAlertasAutomaticasPayload(
  empresaId: string,
): Promise<AlertasAutomaticasPayload> {
  const [vehicles, controlFechas, ingresos, pendientes, kilometrajes] = await Promise.all([
    fetchVehiculos(empresaId),
    fetchLatestControlFechasByVehicle(empresaId),
    fetchIngresos(empresaId),
    fetchPendientes(empresaId),
    fetchKilometrajes(empresaId),
  ]);

  const review = computeTodayReview(
    vehicles,
    controlFechas,
    ingresos,
    pendientes,
    DIAS_ALERTA_SIN_INGRESO,
    kilometrajes,
  );

  const totalAlertasAutomaticas =
    review.vencidosCount +
    review.porVencerCount +
    review.sinIngresoCount +
    review.kmMantVariacionAlertCount;

  return {
    totalAlertasAutomaticas,
    documentosVencidos: review.vencidosCount,
    documentosPorVencer: review.porVencerCount,
    sinIngresosRecientes: review.sinIngresoCount,
    kmSinMantenimiento: review.kmMantVariacionAlertCount,
    pendientesAltaPrioridad: review.pendientesAltaActivosCount,
    sinIngresoUmbralDias: review.sinIngresoUmbralDias,
    count: totalAlertasAutomaticas,
    fuente: 'computeTodayReview (Home / Qué hacer hoy)',
    criterio:
      'Alertas operativas activas: documentos vencidos + por vencer (≤30 d) + sin ingresos recientes + km sin mantenimiento. Solo vehículos activos.',
    notaComparacionDocumentacion: DOCUMENTOS_CRITERIO_INVENTARIO,
    prohibido_inventar:
      'No inventar alertas desactivadas/resueltas: esos estados no existen en los datos. Si difiere de documentación: Documentación = inventario completo; Alertas = Qué hacer hoy.',
    preview: {
      documentosVencidos: review.muestraVencidos.map((x) =>
        previewLine(x.placa, x.detail),
      ),
      documentosPorVencer: review.muestraPorVencer.map((x) =>
        previewLine(x.placa, x.detail),
      ),
      sinIngresosRecientes: review.muestraSinIngreso.map((x) =>
        previewLine(x.placa, x.detail),
      ),
      kmSinMantenimiento: review.muestraKmMantVariacion.map((x) =>
        previewLine(x.placa, x.detail),
      ),
      pendientesAltaPrioridad: review.muestraPendientesAlta.map((p) =>
        p.descripcion.slice(0, 120),
      ),
    },
    nota:
      'totalAlertasAutomaticas = vencidos + por vencer + sin ingreso + km mant. (sin pendientes manuales del equipo).',
  };
}
