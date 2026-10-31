import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Shield } from 'lucide-react';
import {
  UI_ASSIGNABLE_ROLES,
  UI_ROLE_LABELS,
  isUiAssignableRole,
  roleDisplayLabel,
  type UiAssignableRole,
} from '../../config/userRolesUi';
import {
  fetchUserProfilesForAdmin,
  logUserRolesAudit,
  updateUserProfileRole,
  type UserProfileAdminRow,
} from '../../services/userProfilesService';
import type { AppRole } from '../../data/types';
import { useAuth } from '../../context/AuthContext';
import {
  isProtectedRoleManagerUserId,
  roleManagerLabelForUserId,
} from '../../config/roleManagers';
import { precheckAdminRoleChange } from '../../utils/userRoleAdmin';
import Modal from '../../components/Common/Modal';
import Button from '../../components/Common/Button';

type PendingChange = {
  row: UserProfileAdminRow;
  nextRole: UiAssignableRole;
};

const UsuariosPanel: React.FC = () => {
  const navigate = useNavigate();
  const { profile, canManageUserRoles } = useAuth();
  const [rows, setRows] = useState<UserProfileAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<string, UiAssignableRole>>({});
  const [pending, setPending] = useState<PendingChange | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const data = await fetchUserProfilesForAdmin();
      setRows(data);
      logUserRolesAudit(data);
      const drafts: Record<string, UiAssignableRole> = {};
      for (const row of data) {
        if (isUiAssignableRole(row.role)) drafts[row.id] = row.role;
      }
      setDraftRoles(drafts);
    } catch {
      setError('No se pudo cargar la lista de usuarios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visibleRows = useMemo(
    () =>
      rows
        .filter((r) => r.is_active && isUiAssignableRole(r.role))
        .sort((a, b) => a.email.localeCompare(b.email, 'es')),
    [rows],
  );

  const openConfirm = (row: UserProfileAdminRow) => {
    const nextRole = draftRoles[row.id];
    if (!nextRole) return;
    const check = precheckAdminRoleChange({
      actorCanManageRoles: canManageUserRoles,
      actorUserId: profile?.id ?? null,
      targetUserId: row.id,
      targetIsActive: row.is_active,
      targetCurrentRole: row.role,
      requestedRole: nextRole,
    });
    if (!check.allowed) {
      setError(check.message);
      setDraftRoles((prev) => ({ ...prev, [row.id]: row.role as UiAssignableRole }));
      return;
    }
    setError('');
    setPending({ row, nextRole: check.newRole });
  };

  const cancelPending = () => {
    if (pending) {
      setDraftRoles((prev) => ({
        ...prev,
        [pending.row.id]: pending.row.role as UiAssignableRole,
      }));
    }
    setPending(null);
  };

  const confirmRoleChange = async () => {
    if (!pending || savingId) return;
    const { row, nextRole } = pending;
    setSavingId(row.id);
    setError('');
    setSuccess('');
    const result = await updateUserProfileRole(row.id, nextRole);
    setSavingId(null);
    if (!result.ok) {
      setError(result.message || 'No se pudo actualizar el rol.');
      setDraftRoles((prev) => ({ ...prev, [row.id]: row.role as UiAssignableRole }));
      setPending(null);
      return;
    }
    setSuccess(`Rol actualizado: ${row.name || row.email} → ${UI_ROLE_LABELS[nextRole]}.`);
    setPending(null);
    await reload();
  };

  const isRowProtected = (row: UserProfileAdminRow) =>
    isProtectedRoleManagerUserId(row.id) && row.role === 'admin';

  const isSelf = (row: UserProfileAdminRow) => profile?.id === row.id;

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/configuracion')}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">👥 Usuarios y roles</h1>
          <p className="text-sm text-gray-500">
            Alterna entre Administrador y Contador. Los cambios se aplican en Supabase y en sesiones activas.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/90 to-white px-4 py-3 text-sm text-violet-950 shadow-sm">
        <p className="font-semibold flex items-center gap-2">
          <Shield className="text-violet-600" size={18} />
          Administradores principales (Diego SB · Álvaro SB24)
        </p>
        <p className="mt-1 text-xs leading-relaxed text-violet-900/80">
          Otros usuarios con rol administrador operativo no pueden gestionar roles. No puedes cambiar tu propio rol.
          Las dos cuentas principales están protegidas contra degradación accidental.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Usuarios del tenant</p>
          {loading ? <span className="text-xs text-gray-400">Cargando…</span> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-semibold">Usuario</th>
                <th className="px-4 py-3 font-semibold">Rol actual</th>
                <th className="px-4 py-3 font-semibold">Nuevo rol</th>
                <th className="px-4 py-3 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {!loading && visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                    No hay usuarios admin/contador activos en este tenant.
                  </td>
                </tr>
              ) : null}
              {visibleRows.map((row) => {
                const draft = draftRoles[row.id] ?? (row.role as UiAssignableRole);
                const dirty = draft !== row.role;
                const protectedRow = isRowProtected(row);
                const self = isSelf(row);
                const selectDisabled = protectedRow || self || savingId !== null;

                return (
                  <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{row.name || row.email}</p>
                      <p className="text-xs text-gray-500">{row.email}</p>
                      {roleManagerLabelForUserId(row.id) ? (
                        <p className="text-[11px] text-violet-600 mt-0.5 font-medium">
                          {roleManagerLabelForUserId(row.id)}
                        </p>
                      ) : null}
                      {self ? (
                        <p className="text-[11px] text-slate-500 mt-0.5">Tu sesión (no editable)</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          row.role === 'admin'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {roleDisplayLabel(row.role as AppRole)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm min-w-[10rem] disabled:opacity-50"
                        value={draft}
                        disabled={selectDisabled}
                        onChange={(e) =>
                          setDraftRoles((prev) => ({
                            ...prev,
                            [row.id]: e.target.value as UiAssignableRole,
                          }))
                        }
                      >
                        {UI_ASSIGNABLE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {UI_ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={!dirty || selectDisabled || savingId === row.id}
                        onClick={() => openConfirm(row)}
                        className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-40 hover:bg-violet-700 transition-colors"
                      >
                        {savingId === row.id ? 'Guardando…' : 'Cambiar rol'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={pending != null}
        onClose={cancelPending}
        title="Confirmar cambio de rol"
        size="md"
        closeLocked={savingId != null}
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="secondary" onClick={cancelPending} disabled={savingId != null}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => void confirmRoleChange()}
              disabled={savingId != null}
            >
              {savingId ? 'Guardando…' : 'Confirmar cambio'}
            </Button>
          </div>
        }
      >
        {pending ? (
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              Vas a cambiar el rol de{' '}
              <strong className="text-slate-900">{pending.row.name || pending.row.email}</strong>
              {' '}({pending.row.email}).
            </p>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 space-y-1">
              <p>
                <span className="text-slate-500">Rol anterior:</span>{' '}
                <strong>{UI_ROLE_LABELS[pending.row.role as UiAssignableRole]}</strong>
              </p>
              <p>
                <span className="text-slate-500">Rol nuevo:</span>{' '}
                <strong className="text-violet-700">{UI_ROLE_LABELS[pending.nextRole]}</strong>
              </p>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              El usuario verá el cambio en su sesión activa en unos segundos (Realtime + recarga de perfil).
              Los montos y menús se ajustarán según el nuevo rol.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default UsuariosPanel;
