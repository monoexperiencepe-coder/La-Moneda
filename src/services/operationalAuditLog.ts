import { insertFinancialAuditLog } from './financialAuditService';
import { getAuthenticatedUserIdForAudit } from './authAuditUser';

export type OperationalAuditAction =
  | 'create_kilometraje'
  | 'delete_kilometraje'
  | 'create_control_fecha'
  | 'edit_control_fecha'
  | 'delete_control_fecha';

export async function logOperationalAudit(
  action: OperationalAuditAction,
  entityType: 'kilometraje' | 'control_fecha',
  entityId: string | number,
  opts: {
    oldData?: Record<string, unknown> | null;
    newData?: Record<string, unknown> | null;
    reason?: string;
    tenantEmpresaId?: string | null;
  },
): Promise<void> {
  const uid = await getAuthenticatedUserIdForAudit();
  if (!uid) return;
  await insertFinancialAuditLog(
    {
      user_id: uid,
      action_type: action,
      entity_type: entityType,
      entity_id: String(entityId),
      old_data: opts.oldData ?? null,
      new_data: opts.newData ?? null,
      reason: opts.reason ?? null,
    },
    opts.tenantEmpresaId,
  );
}
