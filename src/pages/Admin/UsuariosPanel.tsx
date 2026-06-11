import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
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

const UsuariosPanel: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<UserProfileAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<string, UiAssignableRole>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
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

  /** Solo admin/contador activos (cuentas legadas inactivas quedan fuera de la UI). */
  const visibleRows = useMemo(
    () =>
      rows
        .filter((r) => r.is_active && isUiAssignableRole(r.role))
        .sort((a, b) => a.email.localeCompare(b.email, 'es')),
    [rows],
  );

  const handleSaveRole = async (row: UserProfileAdminRow) => {
    const nextRole = draftRoles[row.id];
    if (!nextRole || nextRole === row.role) return;
    setSavingId(row.id);
    setError('');
    const result = await updateUserProfileRole(row.id, nextRole);
    setSavingId(null);
    if (!result.ok) {
      setError(result.message || 'No se pudo actualizar el rol.');
      return;
    }
    await reload();
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
          <h1 className="text-2xl font-bold text-gray-900">👥 Usuarios y roles</h1>
          <p className="text-sm text-gray-500">
            Solo administrador y contador están habilitados para asignación.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
        <p className="font-medium">Solo cuentas activas admin / contador</p>
        <p className="mt-1 text-xs leading-relaxed">
          Usuarios inactivos o con rol legado no se muestran ni se eliminan de la base de datos.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Usuarios del tenant</p>
          {loading ? <span className="text-xs text-gray-400">Cargando…</span> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-semibold">Usuario</th>
                <th className="px-4 py-3 font-semibold">Rol actual</th>
                <th className="px-4 py-3 font-semibold">Asignar rol</th>
                <th className="px-4 py-3 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {!loading && visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                    No hay usuarios visibles para este tenant.
                  </td>
                </tr>
              ) : null}
              {visibleRows.map((row) => {
                const legacy = !isUiAssignableRole(row.role) || !row.is_active;
                const currentLabel = legacy
                  ? roleDisplayLabel(row.role as AppRole)
                  : UI_ROLE_LABELS[row.role as UiAssignableRole];
                const draft = draftRoles[row.id] ?? (isUiAssignableRole(row.role) ? row.role : 'contador');
                const dirty = row.is_active && draft !== row.role;

                return (
                  <tr key={row.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{row.name || row.email}</p>
                      <p className="text-xs text-gray-500">{row.email}</p>
                      {!row.is_active ? (
                        <p className="text-[11px] text-red-500 mt-0.5">Cuenta inactiva</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          legacy
                            ? 'bg-gray-100 text-gray-600'
                            : row.role === 'admin'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {currentLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.is_active ? (
                        <select
                          className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                          value={draft}
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
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.is_active ? (
                        <button
                          type="button"
                          disabled={!dirty || savingId === row.id}
                          onClick={() => void handleSaveRole(row)}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          {savingId === row.id ? 'Guardando…' : 'Guardar'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UsuariosPanel;
