import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import Card from '../../components/Common/Card';
import Badge from '../../components/Common/Badge';
import Button from '../../components/Common/Button';
import Select from '../../components/Common/Select';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatCurrency, formatDate } from '../../utils/formatting';
import {
  confianzaBadgeVariant,
  confianzaTier,
} from '../../utils/clasificacionGasto';
import { updateClasificacionGasto } from '../../services/gastosService';
import { REVISION_USER_LABEL } from '../../config/app';
import { useAuth } from '../../context/AuthContext';
import { vehicleIdSortRank } from '../../utils/sortByVehicle';
import { SUBTIPOS_REPRESENTACION_INTERNA } from '../../data/representacionInterna';
import { normKey } from '../../utils/subtipoFinancieroLabel';
import {
  getRepresentacionInternaSubtipoLabel,
  normalizeRepresentacionInternaSubtipo,
} from '../../utils/representacionInternaSubtipoLabel';

const TIPO_OPCIONES = [
  { value: 'operativo_vehiculo', label: 'Operativo vehículo' },
  { value: 'operativo_flota_global', label: 'Operativo flota global' },
  { value: 'gastos_globales', label: 'Gastos globales' },
  { value: 'administrativo_empresa', label: 'Administrativo empresa' },
  { value: 'planilla_laboral', label: 'Planilla laboral' },
  { value: 'financiero', label: 'Financiero (legacy)' },
  { value: 'financiero_prestamo', label: 'Financiero / préstamo' },
  { value: 'inversion', label: 'Inversión (legacy)' },
  { value: 'inversion_compra', label: 'Inversión / compra' },
  { value: 'representacion_interna', label: 'Representación interna' },
  { value: 'personal_socios', label: 'Personal socios (legacy)' },
] as const;

const SUBTIPO_OPERATIVO_OPCIONES = [
  { value: 'motor', label: 'Motor' },
  { value: 'frenos', label: 'Frenos' },
  { value: 'suspension', label: 'Suspensión' },
  { value: 'llantas', label: 'Llantas' },
  { value: 'accesorios', label: 'Accesorios' },
  { value: 'Batería', label: 'Batería' },
  { value: 'interior', label: 'Interior' },
  { value: 'combustible', label: 'Combustible' },
  { value: 'gnv', label: 'GNV' },
  { value: 'electricidad', label: 'Electricidad' },
  { value: 'aire_acondicionado', label: 'Aire acondicionado' },
  { value: 'impuesto_vehicular', label: 'Impuesto vehicular' },
  { value: 'planchado_pintura', label: 'Planchado / pintura' },
] as const;

const SUBTIPO_REPRESENTACION_OPCIONES = SUBTIPOS_REPRESENTACION_INTERNA.map((s) => ({
  value: s,
  label: getRepresentacionInternaSubtipoLabel(s),
})) as readonly { value: string; label: string }[];

const SUBTIPO_OPCIONES = [...SUBTIPO_OPERATIVO_OPCIONES, ...SUBTIPO_REPRESENTACION_OPCIONES] as const;

const TIPO_DEFAULT = TIPO_OPCIONES[0].value;
const SUBTIPO_DEFAULT = 'motor';

function normalizeTipo(raw: string | null | undefined): string {
  const r = (raw ?? '').trim();
  if (r === 'personal_socios_familiares' || r === 'personal_socios' || r === 'personales') return 'representacion_interna';
  return r && TIPO_OPCIONES.some((o) => o.value === r) ? r : TIPO_DEFAULT;
}

function normalizeSubtipo(raw: string | null | undefined, tipoFinanza: string): string {
  const r0 = (raw ?? '').trim();
  const r = normKey(r0) === 'bateria' ? 'Batería' : r0;
  if (tipoFinanza === 'representacion_interna') {
    const c = normalizeRepresentacionInternaSubtipo(r);
    if (c) return c;
    return SUBTIPOS_REPRESENTACION_INTERNA[0] ?? SUBTIPO_DEFAULT;
  }
  if (r && SUBTIPO_OPCIONES.some((o) => o.value === r)) return r;
  return SUBTIPO_DEFAULT;
}

function formatRevisionAt(iso: string | null | undefined): string {
  if (!iso?.trim()) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

type Draft = { tipo: string; subtipo: string };

const RevisionClasificacion: React.FC = () => {
  const navigate = useNavigate();
  const { gastosPendientesRevision, vehicles, toast, refreshFromSupabase } =
    useRegistrosContext();
  const { canEditFinances } = useAuth();

  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [pending, setPending] = useState<{ id: number; kind: 'approve' | 'tipo' } | null>(null);

  const ordenados = useMemo(
    () =>
      [...gastosPendientesRevision].sort((a, b) => {
        const vr = vehicleIdSortRank(a.vehicleId) - vehicleIdSortRank(b.vehicleId);
        if (vr !== 0) return vr;
        return (a.clasificacion_confianza ?? 1) - (b.clasificacion_confianza ?? 1);
      }),
    [gastosPendientesRevision],
  );

  useEffect(() => {
    setDrafts(() => {
      const next: Record<number, Draft> = {};
      for (const g of ordenados) {
        const t = normalizeTipo(g.tipo_gasto);
        next[g.id] = {
          tipo: t,
          subtipo: normalizeSubtipo(g.subtipo_gasto, t),
        };
      }
      return next;
    });
  }, [ordenados]);

  const busy = pending !== null;

  const labelVeh = (vehicleId: number | null) => {
    if (vehicleId == null) return '—';
    const v = vehicles.find((x) => x.id === vehicleId);
    return v ? `${v.marca} ${v.modelo} (${v.placa})` : `#${vehicleId}`;
  };

  const handleApprove = useCallback(
    async (gastoId: number) => {
      setPending({ id: gastoId, kind: 'approve' });
      try {
        const revisado_at = new Date().toISOString();
        const updated = await updateClasificacionGasto(gastoId, {
          clasificacion_manual: true,
          requiere_revision: false,
          revisado_at,
          revisado_por: REVISION_USER_LABEL,
        }, {
          reason: 'Aprobación de clasificación manual',
        });
        if (!updated) {
          toast.error('No se pudo aprobar', 'Revisa conexión o permisos en Supabase.');
          return;
        }
        toast.success('Clasificación aprobada', `Gasto #${gastoId}`);
        await refreshFromSupabase();
      } finally {
        setPending(null);
      }
    },
    [refreshFromSupabase, toast],
  );

  const handleSaveTipoSubtipo = useCallback(
    async (gastoId: number) => {
      const d = drafts[gastoId];
      if (!d) return;
      setPending({ id: gastoId, kind: 'tipo' });
      try {
        const revisado_at = new Date().toISOString();
        const updated = await updateClasificacionGasto(gastoId, {
          tipo_gasto: d.tipo,
          subtipo_gasto: d.subtipo,
          clasificacion_manual: true,
          requiere_revision: false,
          revisado_at,
          revisado_por: REVISION_USER_LABEL,
        }, {
          reason: 'Corrección manual tipo/subtipo',
        });
        if (!updated) {
          toast.error('No se guardaron los cambios', 'Revisa conexión o permisos en Supabase.');
          return;
        }
        toast.success('Tipo y subtipo guardados', `Gasto #${gastoId}`);
        await refreshFromSupabase();
      } finally {
        setPending(null);
      }
    },
    [drafts, refreshFromSupabase, toast],
  );

  const colCount = 9;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/finanzas')}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">✅ Revisión clasificación</h1>
          <p className="text-sm text-gray-500">
            Cola de gastos con <code className="text-xs bg-gray-100 px-1 rounded">requiere_revision</code> — menor
            confianza primero
          </p>
        </div>
      </div>

      <Card padding={false} className="p-4">
        <p className="text-sm text-gray-600">
          Las aprobaciones y cambios de tipo/subtipo se guardan en Supabase y actualizan esta lista.
        </p>
      </Card>

      <div className="bg-white rounded-xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Fecha</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase px-4 py-3">Monto</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Vehículo</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3 max-w-[220px]">
                  Comentarios
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3 min-w-[160px]">
                  tipo_gasto
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3 min-w-[160px]">
                  subtipo
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Conf.</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3 min-w-[140px]">
                  Revisión
                </th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ordenados.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center text-sm text-gray-400">
                    No hay gastos pendientes de revisión.
                  </td>
                </tr>
              ) : (
                ordenados.map((g) => {
                  const tier = confianzaTier(g.clasificacion_confianza);
                  const bv = confianzaBadgeVariant(tier);
                  const draft = drafts[g.id];
                  const rowApproving = pending?.id === g.id && pending.kind === 'approve';
                  const rowSavingTipo = pending?.id === g.id && pending.kind === 'tipo';
                  const serverTipo = normalizeTipo(g.tipo_gasto);
                  const serverSub = normalizeSubtipo(g.subtipo_gasto, serverTipo);
                  const dirty =
                    !!draft &&
                    (draft.tipo !== serverTipo || draft.subtipo !== serverSub);

                  return (
                    <tr key={g.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{formatDate(g.fecha)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-red-600 text-right tabular-nums">
                        −{formatCurrency(g.monto)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 max-w-[160px]">{labelVeh(g.vehicleId)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 max-w-[240px]">
                        <span className="line-clamp-2" title={g.comentarios}>
                          {g.comentarios || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {draft ? (
                          <Select
                            options={[...TIPO_OPCIONES]}
                            value={draft.tipo}
                            disabled={busy || !canEditFinances}
                            className="!py-1.5 text-xs min-h-0"
                            onChange={(value) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [g.id]: { ...prev[g.id], tipo: value },
                              }))
                            }
                          />
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {draft ? (
                          <Select
                            options={[...SUBTIPO_OPCIONES]}
                            value={draft.subtipo}
                            disabled={busy || !canEditFinances}
                            className="!py-1.5 text-xs min-h-0"
                            onChange={(value) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [g.id]: { ...prev[g.id], subtipo: value },
                              }))
                            }
                          />
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant={bv} size="sm" dot>
                            {g.clasificacion_confianza != null
                              ? `${(g.clasificacion_confianza * 100).toFixed(0)}%`
                              : '—'}
                          </Badge>
                          {g.clasificacion_manual === true && (
                            <Badge variant="secondary" size="sm">
                              Manual
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        <div className="space-y-0.5">
                          <div>
                            <span className="text-gray-400">Por: </span>
                            {g.revisado_por?.trim() ? g.revisado_por : '—'}
                          </div>
                          <div>
                            <span className="text-gray-400">El: </span>
                            {formatRevisionAt(g.revisado_at)}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5 items-start">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="!py-1 !px-2 h-auto"
                            disabled={busy || !canEditFinances}
                            loading={rowApproving}
                            onClick={() => void handleApprove(g.id)}
                          >
                            Aprobar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="!py-1 !px-2 h-auto text-primary-600"
                            disabled={busy || !dirty || !canEditFinances}
                            loading={rowSavingTipo}
                            onClick={() => void handleSaveTipoSubtipo(g.id)}
                          >
                            Guardar tipo/subtipo
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RevisionClasificacion;
