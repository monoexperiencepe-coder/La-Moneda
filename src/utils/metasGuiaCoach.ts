import type { KPIData, VehicleRentability } from '../data/types';
import { formatCurrency } from './formatting';

export interface MetasGuiaInput {
  year: number;
  activos: number;
  totalVehiculos: number;
  inactivos: number;
  metaUnits: number | null;
  brechaUnits: number | null;
  diasHastaFinAnio: number;
  mesesAprox: number;
  ritmoMensualUnidades: number | null;
  kpis: KPIData | null;
  margenMedianoVehiculo: number | null;
  ingresoMensualPromedioPorActivo: number | null;
  medianaInversionPen: number | null;
  capitalIncrementalEstimado: number | null;
  rentability: VehicleRentability[];
}

export interface MetasGuiaBloque {
  titulo: string;
  items: string[];
}

export interface MetasGuiaResult {
  headline: string;
  bloques: MetasGuiaBloque[];
  pie: string;
}

function ordenarPorMargenAsc(r: VehicleRentability[]) {
  return [...r].sort((a, b) => a.margen - b.margen);
}

function ordenarPorMargenDesc(r: VehicleRentability[]) {
  return [...r].sort((a, b) => b.margen - a.margen);
}

/**
 * Guía en lenguaje natural armada solo con reglas sobre tus datos cargados.
 * No llama a APIs externas (listo para enlazar un LLM más adelante).
 */
export function buildMetasGuia(inp: MetasGuiaInput): MetasGuiaResult {
  const k = inp.kpis;
  const bloques: MetasGuiaBloque[] = [];

  const ascendente = ordenarPorMargenAsc(inp.rentability);
  const descendente = ordenarPorMargenDesc(inp.rentability);
  const peores = ascendente.slice(0, 3);
  const mejores = descendente.slice(0, 2);

  const bajoCero = inp.rentability.filter((r) => r.margen < 0).length;
  const margenPositivoEmpresa = k != null && k.margenNeto > 0;
  const altoRitmo =
    inp.ritmoMensualUnidades != null && inp.ritmoMensualUnidades >= 2.5;

  // Diagnóstico
  const diagnostico: string[] = [];
  if (inp.activos <= 0) {
    diagnostico.push('No tienes vehículos marcados como activos: sin flota operativa no puedo estimar ritmo por unidad; revisa Inventario.');
  } else {
    diagnostico.push(
      `Tu flota muestra ${inp.activos} unidades activas de ${inp.totalVehiculos} en sistema${
        inp.inactivos > 0 ? ` (${inp.inactivos} inactivas: podrían volver a operación o liquidarse con plan).` : '.'
      }`,
    );
  }
  if (k) {
    diagnostico.push(
      `Margen neto acumulado (ingresos − gastos operativos + rebajes) en los datos cargados: ${formatCurrency(k.margenNeto)}${
        margenPositivoEmpresa ? ' — la operación agrega caja a nivel conjunto.' : ' — conviene revisar gastos o precios antes de acelerar compras.'
      }`,
    );
    if (k.totalIngresos > 0) {
      const pct = (k.margenNeto / k.totalIngresos) * 100;
      diagnostico.push(
        `Margen sobre ingresos cargados: ~${pct.toFixed(1)}% (referencia burda; no es contabilidad formal).`,
      );
    }
  }
  if (inp.margenMedianoVehiculo != null && inp.activos > 0) {
    diagnostico.push(
      `El vehículo «de en medio» por rentabilidad histórica muestra ${formatCurrency(inp.margenMedianoVehiculo)} de margen: las nuevas unidades deberían apuntar al menos a no quedar por debajo del tercil inferior si quieres sostener la mediana.`,
    );
  }
  if (bajoCero > 0) {
    diagnostico.push(
      `${bajoCero} unidad(es) activa(s) con margen negativo en Fact: priorizar diagnóstico (frecuencia, tarifa, gasto) antes de duplicar ese patrón con muchas altas.`,
    );
  }
  bloques.push({ titulo: 'Diagnóstico con tus números', items: diagnostico });

  // Plan hacia la meta
  const planMeta: string[] = [];
  if (inp.metaUnits == null) {
    planMeta.push('Establece una meta concreta de unidades activas al 31 de diciembre y pulsa «Guardar meta».');
    planMeta.push(
      'Cuando la tengas, aquí verás ritmo mensual aproximado, capital incremental burdo y estos pasos siguientes afinados.',
    );
  } else if (inp.activos >= inp.metaUnits) {
    planMeta.push(
      `Ya estás en ${inp.activos} activas vs meta ${inp.metaUnits}. Para «superar»: prueba +10% (${Math.ceil(inp.metaUnits * 1.1)} unidades) o +${Math.max(2, Math.ceil(inp.activos * 0.05))} unidades vs hoy, según capacidad de equipo y caja.`,
    );
    planMeta.push(
      'Riesgo al crecer sin subir meta explícita: el margen empresa puede diluirse; agenda revisión mensual de gastos por vehículo y de unidades en rojo.',
    );
  } else {
    const br = inp.brechaUnits ?? 0;
    const r = inp.ritmoMensualUnidades ?? 0;
    planMeta.push(
      `Brecha: ${br} unidades en ~${inp.mesesAprox} meses → incorpora de media ~${r.toFixed(1)} unidades/mes hasta fin de año ${inp.year}.`,
    );
    planMeta.push(
      `Desglose burdo: primera mitad del tiempo ~${Math.ceil(br / 2)} altas, segunda mitad ~${Math.floor(br / 2)} (ajusta si compras tardan en documentarse).`,
    );
    if (inp.capitalIncrementalEstimado != null && inp.medianaInversionPen != null) {
      planMeta.push(
        `Orden de magnitud de caja para esas ${br} altas: ~${formatCurrency(inp.capitalIncrementalEstimado)} (${br} × mediana inversión ${formatCurrency(inp.medianaInversionPen)} por unidad en tabla de inversiones).`,
      );
      planMeta.push(
        'Si financias parte del lote, divide por plazos y tasas en tu hoja de caja externa; esta app no modela deuda de compra.',
      );
    } else {
      planMeta.push(
        'No hay mediana de inversión en PEN suficiente: carga inversiones por vehículo para estimar capital, o usa tu presupuesto manual.',
      );
    }
    if (altoRitmo) {
      planMeta.push(
        'Ritmo alto: asegura paralelamente trámite/legal, mecánica inicial y alta en Fact el mismo mes que pagas — el cuello de botella suele ser tiempo, no sólo dinero.',
      );
    }
    if (inp.ingresoMensualPromedioPorActivo != null && inp.activos > 0) {
      const extraMes = inp.ingresoMensualPromedioPorActivo * br;
      planMeta.push(
        `Si las ${br} nuevas se parecieren al ritmo YTD medio por activo (${formatCurrency(inp.ingresoMensualPromedioPorActivo)}/mes/unidad), el ingreso incremental mensual estabilizado sería ~${formatCurrency(extraMes)}... cuando todas estén activas y facturando; hasta entonces será parcial.`,
      );
    }
  }
  bloques.push({ titulo: 'Camino hasta la meta', items: planMeta });

  // Superar la meta (stretch)
  const superar: string[] = [];
  if (inp.metaUnits != null && inp.brechaUnits != null && inp.brechaUnits > 0) {
    const stretchUnits = Math.max(inp.metaUnits, inp.activos + Math.ceil(inp.brechaUnits * 1.2));
    superar.push(
      `Meta agresiva: apuntar a ${stretchUnits} activas (${Math.ceil((stretchUnits - inp.activos) / inp.mesesAprox)} incorporaciones/mes de media) suele obligar a adelantar compras Q3 o a tener «pipe» de compras cerradas.`,
    );
    superar.push(
      'Dos palancas: (1) reactivar inactivos con margen esperado positivo antes que comprar; (2) clonar proceso de los vehículos con mejor margen del ranking.',
    );
  } else if (inp.metaUnits != null && inp.activos >= inp.metaUnits) {
    superar.push(`Fija nueva meta ${Math.ceil(inp.metaUnits * 1.15)} activas (+15%) y recalcula ritmo desde hoy mismo.`);
    superar.push('Documenta playbook de compra (checklist Excel / Operaciones) para no depender de una sola persona.');
  } else {
    superar.push('Con meta definida, vuelve a leer esta sección; sugerimos siempre un 10–20% extra de «colchón» en unidades solo si la caja y el equipo lo resisten.');
  }
  bloques.push({ titulo: 'Ideas para superar la meta', items: superar });

  // Foco táctico por vehículo
  const tactico: string[] = [];
  if (mejores.length > 0) {
    tactico.push(
      `Referentes: ${mejores
        .map((x) => `${x.vehicle.placa} (${formatCurrency(x.margen)})`)
        .join(' · ')} — replica tipo de contrato, frecuencia de cobro y control de gasto.`,
    );
  }
  if (peores.length > 0) {
    tactico.push(
      `Review urgente: ${peores.map((x) => `${x.vehicle.placa} (${formatCurrency(x.margen)})`).join(' · ')}.`,
    );
    tactico.push('Por cada uno: ¿sube tarifa, baja tiempo parado o baja gasto mecánico? Sin corregir, sumar más unidades empeora el promedio.');
  }
  if (inp.inactivos > 0) {
    tactico.push(
      `${inp.inactivos} vehículo(s) inactivo(s): revisa si conviene reactivar con plan de ingresos antes de asumir solo compras nuevas.`,
    );
  }
  bloques.push({ titulo: 'Prioridades en la operación', items: tactico });

  // Headline
  let headline = '';
  if (!inp.metaUnits) {
    headline =
      `Resumen rápido: ${inp.activos} activas, ${inp.diasHastaFinAnio} días hasta cierre ${inp.year}. Guarda tu meta para un plan cerrado por ritmo y capital.`;
  } else if (inp.brechaUnits === 0 || inp.activos >= inp.metaUnits) {
    headline = `Estás dentro o por encima de tu meta (${inp.metaUnits} activas objetivo vs ${inp.activos} hoy). Usa los bloques de abajo para estiramiento y defensa del margen.`;
  } else {
    headline = `Objetivo: ${inp.metaUnits} activas · hoy ${inp.activos} · faltan ${inp.brechaUnits}. Ritmo medio requerido: ~${inp.ritmoMensualUnidades?.toFixed(1)} unidades por mes hasta fin de año.`;
  }

  const pie =
    'Texto generado automáticamente con reglas sobre tus cargas Fact (sin modelo de IA externo). Actualiza datos y revisa Inventario / Reportes; no sustituye asesor financiero ni legal.';

  return { headline, bloques, pie };
}
