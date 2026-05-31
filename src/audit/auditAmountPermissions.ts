import type { Gasto, Ingreso } from '../data/types';
import type { PermissionUser } from '../utils/permissions';
import {
  canAccessAI,
  canViewAmountForRecord,
  canViewAmountsGlobal,
  resolveRecordCreatedBy,
} from '../utils/amountPermissions';
import {
  AMOUNT_SURFACE_REGISTRY,
  summarizeAmountSurfaceAudit,
  type AmountSurfaceAuditSummary,
} from './auditAmountSurface';

export type AmountPermissionsAuditResult = {
  role: string;
  userId: string | null;
  canViewGlobalAmounts: boolean;
  canAccessAI: boolean;
  sampleRecords: Array<{
    id: string;
    kind: 'gasto' | 'ingreso';
    createdBy: string | null;
    createdAt: string;
    canViewAmount: boolean;
  }>;
  recordsVisibleBy24hRule: number;
  recordsMasked: number;
  missingCreatedBy: number;
  warnings: string[];
  surface: AmountSurfaceAuditSummary;
};

export function auditAmountPermissions(
  user: PermissionUser | null | undefined,
  gastos: Gasto[],
  ingresos: Ingreso[],
): AmountPermissionsAuditResult {
  const role = user?.role ?? 'unknown';
  const userId = user?.id ?? null;
  const warnings: string[] = [];

  if (!user) warnings.push('Sin usuario autenticado.');
  if (role === 'contador' && !userId) {
    warnings.push('Contador sin profile.id: no podrá ver montos propios por regla 24h.');
  }

  const sampleRecords: AmountPermissionsAuditResult['sampleRecords'] = [];
  let recordsVisibleBy24hRule = 0;
  let recordsMasked = 0;
  let missingCreatedBy = 0;

  const pushRecord = (kind: 'gasto' | 'ingreso', r: Gasto | Ingreso) => {
    const createdBy = resolveRecordCreatedBy(r);
    if (!createdBy) missingCreatedBy += 1;
    const canViewAmount = canViewAmountForRecord({
      role,
      userId,
      recordCreatedBy: createdBy,
      recordCreatedAt: r.createdAt,
    });
    if (canViewAmount) recordsVisibleBy24hRule += 1;
    else recordsMasked += 1;
    if (sampleRecords.length < 12) {
      sampleRecords.push({
        id: r.id,
        kind,
        createdBy,
        createdAt: r.createdAt,
        canViewAmount,
      });
    }
  };

  for (const g of gastos.slice(0, 8)) pushRecord('gasto', g);
  for (const i of ingresos.slice(0, 4)) pushRecord('ingreso', i);

  if (role === 'contador' && missingCreatedBy > 0) {
    warnings.push(
      `${missingCreatedBy} registro(s) sin created_by confiable (excel_extra._lm_created_by); montos enmascarados por seguridad.`,
    );
  }

  const surface = summarizeAmountSurfaceAudit(AMOUNT_SURFACE_REGISTRY);
  if (surface.ALTO > 0 || surface.CRÍTICO > 0) {
    warnings.push(
      `Superficies pendientes: ALTO=${surface.ALTO}, CRÍTICO=${surface.CRÍTICO}. Componentes: ${surface.pendientes.map((p) => p.component).join(', ')}`,
    );
  }

  return {
    role,
    userId,
    canViewGlobalAmounts: canViewAmountsGlobal(role),
    canAccessAI: canAccessAI(role),
    sampleRecords,
    recordsVisibleBy24hRule,
    recordsMasked,
    missingCreatedBy,
    warnings,
    surface,
  };
}
