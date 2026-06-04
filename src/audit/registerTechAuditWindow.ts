import type { TechAuditContext } from './techAuditDiagnostics';
import { auditUtilidadVehiculos, type AuditUtilidadVehiculosInput } from './auditUtilidadVehiculos';
import { auditGastosVehiculo } from './auditGastosVehiculo';
import { auditGastosClasificacionVehiculo } from './auditGastosClasificacionVehiculo';
import {
  auditConductores,
  auditKmQaFlow,
  auditDocumentacionQaFlow,
  auditKmState,
  auditSubtiposAdmin,
  auditSubtiposAll,
  auditSubtiposInversion,
  auditSubtiposRepresentacion,
  auditVehiculos,
  runTechAuditFull,
} from './techAuditDiagnostics';
import {
  logSubtipoFactAuditFull,
  logSubtipoFactDataAudit,
  logSubtipoFactImpactAudit,
  logSubtipoFactMapAudit,
  summarizeSubtipoFactInferability,
} from './auditSubtipoFact';
import { logFinancierosSubtiposAudit } from './auditFinancierosSubtipos';
import { logAdministrativosSubtiposAudit } from './auditAdministrativosSubtipos';
import { logOperativosSubtiposAudit } from './auditOperativosSubtipos';
import { registerDataQualityWindow } from './registerDataQualityWindow';
import { auditAmountPermissions } from './auditAmountPermissions';
import { runAuditUtilidadCompare } from '../hooks/useUtilidadRealCalculos';

declare global {
  interface Window {
    runTechAudit: () => void;
    auditVehiculos: () => void;
    auditConductores: () => void;
    auditKm: (vehicleId?: number | string) => void;
    auditKmQaFlow: () => ReturnType<typeof auditKmQaFlow>;
    auditDocumentacionQaFlow: () => ReturnType<typeof auditDocumentacionQaFlow>;
    auditSubtiposAdmin: () => void;
    auditSubtiposRepresentacion: () => void;
    auditSubtiposInversion: () => void;
    auditSubtiposAll: () => void;
    auditSubtipoFactMap: (categoria?: string) => void;
    auditSubtipoFactData: () => void;
    auditSubtipoFactImpact: () => void;
    auditSubtipoFactFull: () => void;
    auditSubtipoFactInferability: () => void;
    auditFinancierosSubtipos: () => void;
    auditAdministrativosSubtipos: () => void;
    auditOperativosSubtipos: () => void;
    auditAmountPermissions: () => ReturnType<typeof auditAmountPermissions>;
    auditUtilidadVehiculos: () => ReturnType<typeof auditUtilidadVehiculos>;
    auditGastosVehiculo: (idOrPlaca?: number | string) => ReturnType<typeof auditGastosVehiculo>;
    auditGastosClasificacionVehiculo: (
      idOrPlaca?: number | string,
    ) => ReturnType<typeof auditGastosClasificacionVehiculo>;
    auditUtilidadCompare: (vehicleIdOrPlaca?: number | string) => void;
  }
}

export function registerTechAuditWindow(ctx: TechAuditContext): void {
  window.runTechAudit = () => runTechAuditFull(ctx);
  window.auditVehiculos = () => auditVehiculos(ctx.getVehicles());
  window.auditConductores = () => auditConductores(ctx.getConductores(), ctx.getVehicles());
  window.auditKm = (vehicleId?: number | string) => auditKmState(ctx.getKilometrajes(), vehicleId);
  window.auditKmQaFlow = () => auditKmQaFlow();
  window.auditDocumentacionQaFlow = () => auditDocumentacionQaFlow();
  window.auditSubtiposAdmin = () => auditSubtiposAdmin(ctx.getGastos());
  window.auditSubtiposRepresentacion = () => auditSubtiposRepresentacion(ctx.getGastos());
  window.auditSubtiposInversion = () => auditSubtiposInversion(ctx.getGastos());
  window.auditSubtiposAll = () => auditSubtiposAll(ctx.getGastos());
  window.auditSubtipoFactMap = (categoria?: string) =>
    logSubtipoFactMapAudit(categoria as import('./auditSubtipoFact').OfficialSubtipoCategoria | undefined);
  window.auditSubtipoFactData = () => logSubtipoFactDataAudit(ctx.getGastos());
  window.auditSubtipoFactImpact = () => logSubtipoFactImpactAudit();
  window.auditSubtipoFactFull = () => logSubtipoFactAuditFull(ctx.getGastos());
  window.auditSubtipoFactInferability = () =>
    console.log('[subtipo-fact:inferability]', summarizeSubtipoFactInferability());
  window.auditFinancierosSubtipos = () => logFinancierosSubtiposAudit(ctx.getGastos());
  window.auditAdministrativosSubtipos = () => logAdministrativosSubtiposAudit(ctx.getGastos());
  window.auditOperativosSubtipos = () => logOperativosSubtiposAudit(ctx.getGastos());
  window.auditAmountPermissions = () => {
    const result = auditAmountPermissions(ctx.getPermissionUser?.(), ctx.getGastos(), ctx.getIngresos?.() ?? []);
    const { surface } = result;
    console.log('[auditAmountPermissions]', result);
    console.log(
      `[auditAmountPermissions] Superficies — ALTO=${surface.ALTO}, CRÍTICO=${surface.CRÍTICO}, MEDIO=${surface.MEDIO}`,
    );
    return result;
  };

  window.auditUtilidadVehiculos = () => {
    const payload: AuditUtilidadVehiculosInput = {
      vehicles: ctx.getVehicles(),
      ingresos: ctx.getIngresos?.() ?? [],
      gastos: ctx.getGastos(),
      cajaNegocioVehiculo: ctx.getCajaNegocioVehiculo?.() ?? [],
      gastosCaja: ctx.getGastosCaja?.() ?? [],
      descuentos: ctx.getDescuentos?.() ?? [],
      gastosLoadScope: ctx.getGastosLoadScope?.() ?? 'recent',
    };
    return auditUtilidadVehiculos(payload);
  };

  window.auditGastosVehiculo = (idOrPlaca?: number | string) =>
    auditGastosVehiculo(
      {
        vehicles: ctx.getVehicles(),
        gastos: ctx.getGastos(),
        gastosLoadScope: ctx.getGastosLoadScope?.() ?? 'recent',
        ingresos: ctx.getIngresos?.() ?? [],
        empresaId: ctx.getEmpresaId?.() ?? null,
      },
      idOrPlaca,
    );

  window.auditGastosClasificacionVehiculo = (idOrPlaca?: number | string) =>
    auditGastosClasificacionVehiculo(
      {
        vehicles: ctx.getVehicles(),
        gastos: ctx.getGastos(),
        ingresos: ctx.getIngresos?.() ?? [],
        gastosLoadScope: ctx.getGastosLoadScope?.() ?? 'recent',
      },
      idOrPlaca,
    );

  window.auditUtilidadCompare = (vehicleIdOrPlaca: number | string = 1) => {
    runAuditUtilidadCompare(
      vehicleIdOrPlaca,
      ctx.getVehicles(),
      ctx.getIngresos?.() ?? [],
      ctx.getGastos(),
      ctx.getGastosLoadScope?.() ?? 'recent',
    );
  };

  registerDataQualityWindow({ getGastos: ctx.getGastos });

  console.info(
    '[tech-audit] DEV: auditUtilidadCompare(1) | auditGastosClasificacionVehiculo("PLACA") | auditUtilidadVehiculos() | …',
  );
}
