import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Trash2, Loader2 } from 'lucide-react';
import Card from '../../components/Common/Card';
import Modal from '../../components/Common/Modal';
import Button from '../../components/Common/Button';
import {
  fetchFinancialAuditLogs,
  deleteFinancialAuditLog,
  clearFinancialAuditLogs,
  clearFinancialAuditLogsBefore,
} from '../../services/financialAuditService';
import type { FinancialAuditLog } from '../../data/types';
import { formatDateTimePe } from '../../utils/formatting';
import { useAuth } from '../../context/AuthContext';
import { isAdminRole } from '../../utils/roles';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { fetchUserProfilesLookup } from '../../services/userProfilesService';
import {
  formatAuditChangeSummary,
  formatAuditEntitySummary,
  formatAuditUserDisplay,
} from '../../utils/auditLogDisplay';
import { AUDIT_LOGS_REALTIME_EVENT } from '../../hooks/useEmpresaRegistrosRealtime';

/** Etiquetas en español para action_type (incluye legados). */
const ACTION_LABELS: Record<string, string> = {
  create_income: 'Creó ingreso',
  edit_income: 'Editó ingreso',
  delete_income: 'Eliminó ingreso',
  create_expense: 'Creó gasto',
  edit_expense: 'Editó gasto',
  delete_expense: 'Eliminó gasto',
  fix_classification: 'Corrigió clasificación',
  move_category: 'Movió categoría',
  move_expense_category: 'Reclasificó devolución garantía',
  undo_move_category: 'Revirtió mover categoría',
  change_vehicle_id: 'Cambió vehículo del gasto',
  change_amount: 'Cambió monto del gasto',
  delete_record: 'Eliminó gasto',
  edit_gasto: 'Editó gasto',
  create_kilometraje: 'Registró kilometraje',
  delete_kilometraje: 'Eliminó kilometraje',
  create_control_fecha: 'Registró documentación',
  edit_control_fecha: 'Editó documentación',
  delete_control_fecha: 'Eliminó documentación',
};

function actionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] ?? actionType;
}

type ConfirmModal =
  | null
  | { kind: 'one'; row: FinancialAuditLog }
  | { kind: 'all' }
  | { kind: 'before'; date: string };

const HistorialSistema: React.FC = () => {
  const navigate = useNavigate();
  const { role, profile } = useAuth();
  const admin = isAdminRole(role);
  const tenantEmpresaId = profile?.empresa_id;
  const { toast, vehicles } = useRegistrosContext();

  const [rows, setRows] = useState<FinancialAuditLog[]>([]);
  const [userLookup, setUserLookup] = useState<Map<string, { name: string; email: string }>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [clearBeforeDate, setClearBeforeDate] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    const [data, profiles] = await Promise.all([
      fetchFinancialAuditLogs(300, tenantEmpresaId),
      fetchUserProfilesLookup(),
    ]);
    setRows(data);
    setUserLookup(profiles);
    setLoading(false);
  }, [tenantEmpresaId]);

  useEffect(() => {
    void reload();
  }, [reload, reloadNonce]);

  useEffect(() => {
    const onRemoteAudit = () => setReloadNonce((n) => n + 1);
    window.addEventListener(AUDIT_LOGS_REALTIME_EVENT, onRemoteAudit);
    return () => window.removeEventListener(AUDIT_LOGS_REALTIME_EVENT, onRemoteAudit);
  }, []);

  const runDeleteOne = async () => {
    if (!confirmModal || confirmModal.kind !== 'one') return;
    const id = confirmModal.row.id;
    setDeletingId(id);
    try {
      const ok = await deleteFinancialAuditLog(id, tenantEmpresaId);
      if (!ok) {
        toast.error('No se pudo eliminar el log');
        return;
      }
      toast.success('Log eliminado');
      setConfirmModal(null);
      setReloadNonce((n) => n + 1);
    } finally {
      setDeletingId(null);
    }
  };

  const runClearAll = async () => {
    if (!confirmModal || confirmModal.kind !== 'all') return;
    setBulkBusy(true);
    try {
      const ok = await clearFinancialAuditLogs(tenantEmpresaId);
      if (!ok) {
        toast.error('No se pudieron eliminar los logs');
        return;
      }
      toast.success('Historial de auditoría vaciado');
      setConfirmModal(null);
      setReloadNonce((n) => n + 1);
    } finally {
      setBulkBusy(false);
    }
  };

  const runClearBefore = async () => {
    if (!confirmModal || confirmModal.kind !== 'before') return;
    setBulkBusy(true);
    try {
      const ok = await clearFinancialAuditLogsBefore(confirmModal.date, tenantEmpresaId);
      if (!ok) {
        toast.error('No se pudieron eliminar los logs');
        return;
      }
      toast.success('Logs anteriores eliminados');
      setConfirmModal(null);
      setReloadNonce((n) => n + 1);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/configuracion')}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Historial del sistema</h1>
          <p className="text-sm text-gray-500">Auditoría financiera de cambios críticos.</p>
        </div>
      </div>

      {admin && (
        <Card>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-end">
            <div className="flex flex-col gap-1">
              <label htmlFor="audit-clear-before" className="text-xs font-medium text-gray-500">
                Eliminar logs anteriores a (fecha)
              </label>
              <input
                id="audit-clear-before"
                type="date"
                value={clearBeforeDate}
                onChange={(e) => setClearBeforeDate(e.target.value)}
                className="input-field text-sm max-w-[200px]"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!clearBeforeDate.trim() || bulkBusy}
              onClick={() => {
                if (!clearBeforeDate.trim()) return;
                setConfirmModal({ kind: 'before', date: clearBeforeDate.trim() });
              }}
            >
              Eliminar por fecha
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={bulkBusy}
              className="sm:ml-auto"
              onClick={() => setConfirmModal({ kind: 'all' })}
            >
              Limpiar todos los logs
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Solo afecta la tabla <code className="text-gray-600">financial_audit_logs</code>. Requiere rol admin en
            Supabase (RLS).
          </p>
        </Card>
      )}

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-3 py-3 w-[140px] max-w-[180px]">
                  Usuario
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Acción</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-3 py-3 min-w-[200px]">
                  Entidad
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Cambio realizado</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Fecha</th>
                {admin && (
                  <th className="text-center text-xs font-semibold text-gray-500 uppercase px-4 py-3 w-24">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={admin ? 6 : 5} className="px-4 py-10 text-sm text-gray-400 text-center">
                    Cargando historial...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={admin ? 6 : 5} className="px-4 py-10 text-sm text-gray-400 text-center">
                    Sin logs registrados.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const changeSummary = formatAuditChangeSummary(r, vehicles);
                  return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td
                      className="px-3 py-3 text-sm text-gray-700 max-w-[180px] truncate"
                      title={r.userId}
                    >
                      {formatAuditUserDisplay(r.userId, userLookup)}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-800">{actionLabel(r.actionType)}</td>
                    <td
                      className="px-3 py-3 text-xs text-gray-600 max-w-[280px]"
                      title={`${r.entityType} ${r.entityId}`}
                    >
                      <span className="line-clamp-2">{formatAuditEntitySummary(r, vehicles)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[420px]">
                      <span className="line-clamp-2" title={changeSummary}>
                        {changeSummary}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap" title={r.createdAt}>
                      {formatDateTimePe(r.createdAt)}
                    </td>
                    {admin && (
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          disabled={deletingId === r.id}
                          onClick={() => setConfirmModal({ kind: 'one', row: r })}
                          className="inline-flex items-center justify-center p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-50 disabled:pointer-events-none"
                          title="Eliminar log"
                        >
                          {deletingId === r.id ? (
                            <Loader2 size={16} className="animate-spin text-red-500" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </td>
                    )}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={confirmModal?.kind === 'one'}
        onClose={() => !deletingId && setConfirmModal(null)}
        title="Eliminar log"
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={!!deletingId} onClick={() => setConfirmModal(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={!!deletingId} onClick={() => void runDeleteOne()}>
              Eliminar
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          ¿Eliminar este registro de auditoría? No modifica ingresos ni gastos.
        </p>
      </Modal>

      <Modal
        isOpen={confirmModal?.kind === 'all'}
        onClose={() => !bulkBusy && setConfirmModal(null)}
        title="Vaciar historial"
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={bulkBusy} onClick={() => setConfirmModal(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={bulkBusy} onClick={() => void runClearAll()}>
              Eliminar todos
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Se borrarán todos los logs de <strong>financial_audit_logs</strong>. Esta acción no se puede deshacer.
        </p>
      </Modal>

      <Modal
        isOpen={confirmModal?.kind === 'before'}
        onClose={() => !bulkBusy && setConfirmModal(null)}
        title="Eliminar logs por fecha"
        size="sm"
        footer={
          <>
            <Button variant="ghost" disabled={bulkBusy} onClick={() => setConfirmModal(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={bulkBusy} onClick={() => void runClearBefore()}>
              Eliminar anteriores
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Se eliminarán los logs con fecha <strong>anterior</strong> al día{' '}
          <strong>{confirmModal?.kind === 'before' ? confirmModal.date : ''}</strong> (inicio del día en UTC). No afecta
          ingresos ni gastos.
        </p>
      </Modal>
    </div>
  );
};

export default HistorialSistema;
