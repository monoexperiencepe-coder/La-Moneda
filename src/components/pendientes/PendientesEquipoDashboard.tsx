import React, { useMemo, useState } from 'react';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Pendiente } from '../../data/types';
import { useAuth } from '../../context/AuthContext';
import { useRegistrosContext } from '../../context/RegistrosContext';
import Modal from '../Common/Modal';
import Button from '../Common/Button';
import Input from '../Common/Input';
import {
  countPendientesAntiguos,
  emptyPendienteForm,
  filterPendientesDashboardActivos,
  filterPendientesResueltos,
  formValuesToPendientePayload,
  pendienteAutorLabel,
  pendienteFechaCortaLabel,
  pendienteTitulo,
  canDeletePendiente,
  estadoFromV2,
} from '../../utils/pendienteModel';
import { todayStr, tomorrowStr } from '../../utils/formatting';

export interface PendientesEquipoDashboardProps {
  pendientes: Pendiente[];
  className?: string;
}

type FechaRapida = 'hoy' | 'manana' | 'elegir';

const PendientesEquipoDashboard: React.FC<PendientesEquipoDashboardProps> = ({
  pendientes,
  className = '',
}) => {
  const navigate = useNavigate();
  const { user, isAdmin, profile } = useAuth();
  const { addPendiente, updatePendiente, deletePendiente } = useRegistrosContext();

  const [formOpen, setFormOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [fechaRapida, setFechaRapida] = useState<FechaRapida>('hoy');
  const [fechaCustom, setFechaCustom] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showResueltos, setShowResueltos] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Pendiente | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const activos = useMemo(() => filterPendientesDashboardActivos(pendientes), [pendientes]);
  const resueltos = useMemo(() => filterPendientesResueltos(pendientes), [pendientes]);
  const antiguos = useMemo(() => countPendientesAntiguos(pendientes), [pendientes]);
  const today = todayStr();

  const fechaObjetivo = (): string => {
    if (fechaRapida === 'hoy') return today;
    if (fechaRapida === 'manana') return tomorrowStr();
    return fechaCustom.slice(0, 10) || today;
  };

  const guardar = async () => {
    const titulo = texto.trim();
    if (!titulo || saving) return;
    setSaving(true);
    try {
      const f = emptyPendienteForm();
      f.titulo = titulo;
      f.descripcion = titulo;
      f.fecha = today;
      f.fechaObjetivo = fechaObjetivo();
      f.prioridadV2 = 'media';
      f.estadoV2 = 'abierto';
      f.mostrarEnHoy = true;
      await addPendiente(formValuesToPendientePayload(f));
      setTexto('');
      setFormOpen(false);
      setFechaRapida('hoy');
    } finally {
      setSaving(false);
    }
  };

  const resolver = async (p: Pendiente) => {
    setBusyId(p.id);
    try {
      const now = new Date().toISOString();
      await updatePendiente(p.id, {
        estado: estadoFromV2('completado'),
        resolvedAt: now,
        resolvedBy: profile?.id ?? user?.id ?? null,
      });
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await deletePendiente(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <section
      className={`rounded-[24px] border border-violet-200/80 bg-gradient-to-br from-violet-50/60 via-white to-white shadow-soft overflow-hidden ${className}`}
      aria-label="Pendientes del equipo"
    >
      <div className="h-[3px] bg-violet-500" />
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700/80">
              Pendientes del equipo
            </p>
            <p className="mt-0.5 text-sm font-black text-violet-950">
              {activos.length} pendiente{activos.length !== 1 ? 's' : ''} abierto{activos.length !== 1 ? 's' : ''}
            </p>
            <p className="mt-1 text-[11px] text-slate-600 leading-snug">
              Pendientes que el equipo dejó para no olvidar.
            </p>
            {antiguos > 0 ? (
              <p className="mt-0.5 text-[11px] font-semibold text-amber-700">
                {antiguos} vienen de días anteriores
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800 min-h-10"
          >
            <Plus size={14} />
            Agregar pendiente
          </button>
        </div>

        {activos.length === 0 ? (
          <p className="text-sm font-medium text-emerald-700 py-2">
            Sin pendientes abiertos — el tablero está limpio.
          </p>
        ) : (
          <ul className="space-y-2">
            {activos.map((p) => {
              const fechaShow = p.fechaObjetivo ?? p.fecha;
              const puedeBorrar = canDeletePendiente(p, profile?.id ?? user?.id, isAdmin);
              return (
                <li
                  key={p.id}
                  className="rounded-xl border border-violet-100 bg-white/90 p-3 shadow-sm"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="text-lg shrink-0" aria-hidden>
                      📝
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 leading-snug">
                        {pendienteTitulo(p)}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        Por {pendienteAutorLabel(p)} · {pendienteFechaCortaLabel(fechaShow, today)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === p.id}
                      onClick={() => void resolver(p)}
                      className="inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 min-h-9 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {busyId === p.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Check size={14} />
                      )}
                      Resolver
                    </button>
                    {puedeBorrar ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(p)}
                        className="inline-flex items-center justify-center min-h-9 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                        title="Eliminar pendiente"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-violet-100/80">
          <button
            type="button"
            onClick={() => setShowResueltos((v) => !v)}
            className="text-[11px] font-semibold text-violet-700 hover:text-violet-900 underline-offset-2 hover:underline"
          >
            {showResueltos ? 'Ocultar resueltos' : 'Ver resueltos'}
            {!showResueltos && resueltos.length > 0 ? ` (${resueltos.length})` : ''}
          </button>
          <span className="text-gray-300">·</span>
          <button
            type="button"
            onClick={() => navigate('/operaciones/pendientes')}
            className="text-[11px] font-semibold text-slate-600 hover:text-slate-900"
          >
            Ver todos
          </button>
        </div>

        {showResueltos && resueltos.length > 0 ? (
          <ul className="space-y-1.5 pt-1">
            {resueltos.slice(0, 8).map((p) => (
              <li key={p.id} className="text-[11px] text-gray-500 line-through opacity-70 truncate">
                {pendienteTitulo(p)}
              </li>
            ))}
            {resueltos.length > 8 ? (
              <li className="text-[10px] text-gray-400">+{resueltos.length - 8} más resueltos</li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <Modal
        isOpen={formOpen}
        onClose={() => !saving && setFormOpen(false)}
        title="Agregar pendiente"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void guardar()} loading={saving} disabled={!texto.trim()}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="pendiente-texto" className="label">
              ¿Qué hay que recordar?
            </label>
            <textarea
              id="pendiente-texto"
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="input-field w-full text-sm resize-y min-h-[4rem]"
              placeholder="Ej. Revisar pagos pendientes"
              autoFocus
            />
          </div>
          <div>
            <p className="label mb-2">Fecha</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'hoy' as const, label: 'Hoy' },
                  { id: 'manana' as const, label: 'Mañana' },
                  { id: 'elegir' as const, label: 'Elegir fecha' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFechaRapida(opt.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${
                    fechaRapida === opt.id
                      ? 'border-violet-500 bg-violet-50 text-violet-900'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {fechaRapida === 'elegir' ? (
              <Input
                className="mt-2"
                type="date"
                value={fechaCustom}
                onChange={(e) => setFechaCustom(e.target.value)}
              />
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={deleteTarget != null}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        title="Eliminar pendiente"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} loading={deleteBusy}>
              Eliminar
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          ¿Eliminar «{deleteTarget ? pendienteTitulo(deleteTarget) : ''}»? Solo el creador o un admin
          puede hacerlo.
        </p>
      </Modal>
    </section>
  );
};

export default PendientesEquipoDashboard;
