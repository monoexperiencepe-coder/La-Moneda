import React from 'react';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import type {
  IaCalidadAgrupacion,
  IaCalidadFiltroRapido,
  IaCalidadMetricas,
  IaFeedbackMetricas,
  IaPatronAprendido,
} from '../../utils/iaClasificacionCalidad';
import {
  IA_CALIDAD_ALTA_MIN,
  IA_CALIDAD_MEDIA_MIN,
  iaCalidadBandaLabel,
} from '../../utils/iaClasificacionCalidad';

type Props = {
  metricas: IaCalidadMetricas;
  porCategoria: IaCalidadAgrupacion[];
  porSubtipo: IaCalidadAgrupacion[];
  patronesAprendidos: IaPatronAprendido[];
  feedbackMetricas: IaFeedbackMetricas;
  filtroRapido: IaCalidadFiltroRapido;
  onFiltroRapido: (f: IaCalidadFiltroRapido) => void;
  loading?: boolean;
};

const FILTROS_RAPIDOS: { id: IaCalidadFiltroRapido; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'alta', label: `Alta ≥${IA_CALIDAD_ALTA_MIN * 100}%` },
  { id: 'baja', label: `Baja <${IA_CALIDAD_MEDIA_MIN * 100}%` },
  { id: 'sin_subtipo', label: 'Sin subtipo' },
  { id: 'requiere_revision', label: 'Requiere revisión' },
];

function MetricCard({
  label,
  value,
  sub,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  sub?: string;
  tone: 'slate' | 'emerald' | 'amber' | 'red' | 'indigo' | 'violet' | 'sky';
  active?: boolean;
  onClick?: () => void;
}) {
  const tones: Record<typeof tone, string> = {
    slate: 'border-slate-200 bg-white text-slate-800',
    emerald: 'border-emerald-200 bg-emerald-50/80 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50/80 text-amber-900',
    red: 'border-red-200 bg-red-50/80 text-red-900',
    indigo: 'border-indigo-200 bg-indigo-50/80 text-indigo-900',
    violet: 'border-violet-200 bg-violet-50/80 text-violet-900',
    sky: 'border-sky-200 bg-sky-50/80 text-sky-900',
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-2 text-left transition-shadow ${tones[tone]} ${
        onClick ? 'hover:ring-2 hover:ring-indigo-200/80' : ''
      } ${active ? 'ring-2 ring-indigo-400' : ''}`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] opacity-75">{sub}</p> : null}
    </Tag>
  );
}

function AgrupacionLista({
  titulo,
  items,
  max,
}: {
  titulo: string;
  items: IaCalidadAgrupacion[];
  max: number;
}) {
  const top = items.slice(0, max);
  const maxCount = top[0]?.count ?? 1;
  return (
    <div className="rounded-lg border border-slate-200/90 bg-white p-2.5 sm:p-3">
      <p className="text-xs font-semibold text-slate-700">{titulo}</p>
      {top.length === 0 ? (
        <p className="mt-2 text-[11px] text-slate-500">Sin datos en el lote actual.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {top.map((item) => (
            <li key={item.key}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate text-slate-800" title={item.label}>
                  {item.label}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-600">{item.count}</span>
              </div>
              <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-400/90"
                  style={{ width: `${Math.max(8, (item.count / maxCount) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const IAClasificacionCalidadPanel: React.FC<Props> = ({
  metricas,
  porCategoria,
  porSubtipo,
  patronesAprendidos,
  feedbackMetricas,
  filtroRapido,
  onFiltroRapido,
  loading = false,
}) => {
  const pctAlta = metricas.total > 0 ? Math.round((metricas.alta / metricas.total) * 100) : 0;
  const pctHeur = metricas.total > 0 ? Math.round((metricas.heuristica / metricas.total) * 100) : 0;

  return (
    <section
      className="space-y-3 rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-50 to-indigo-50/30 p-3 sm:p-4"
      aria-label="Panel de calidad IA"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-600" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Panel de calidad</h2>
        </div>
        <p className="text-[10px] text-slate-500">
          {iaCalidadBandaLabel('alta')} · {iaCalidadBandaLabel('media')} · {iaCalidadBandaLabel('baja')}
          {loading ? ' · actualizando…' : ''}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        <MetricCard
          label="Memoria humana"
          value={metricas.memoriaHumana}
          sub={metricas.total > 0 ? `${metricas.pctMemoria}% mem.+mixto` : undefined}
          tone="indigo"
        />
        <MetricCard
          label="Heurística"
          value={metricas.heuristica}
          sub={metricas.total > 0 ? `${pctHeur}% del lote` : undefined}
          tone="slate"
        />
        <MetricCard label="Mixto" value={metricas.mixto} tone="violet" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <MetricCard label="Analizados" value={metricas.total} tone="slate" />
        <MetricCard
          label="Alta confianza"
          value={metricas.alta}
          sub={metricas.total > 0 ? `${pctAlta}% del lote` : undefined}
          tone="emerald"
          active={filtroRapido === 'alta'}
          onClick={() => onFiltroRapido(filtroRapido === 'alta' ? 'all' : 'alta')}
        />
        <MetricCard label="Media" value={metricas.media} tone="amber" />
        <MetricCard
          label="Baja"
          value={metricas.baja}
          tone="red"
          active={filtroRapido === 'baja'}
          onClick={() => onFiltroRapido(filtroRapido === 'baja' ? 'all' : 'baja')}
        />
        <MetricCard label="Revisados" value={metricas.revisados} tone="sky" />
        <MetricCard label="Aplicados" value={metricas.aplicados} tone="indigo" />
        <MetricCard label="Ignorados" value={metricas.ignorados} tone="violet" />
        <MetricCard label="Errores" value={metricas.errores} tone="red" />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50/60 px-2.5 py-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden />
        <span className="text-xs text-amber-950">
          <strong>{metricas.requiereRevision}</strong> sugerencias débiles — revisar antes de un lote masivo.
        </span>
        <button
          type="button"
          className={`ml-auto rounded-md px-2 py-0.5 text-[10px] font-semibold ${
            filtroRapido === 'requiere_revision'
              ? 'bg-amber-700 text-white'
              : 'bg-white text-amber-900 ring-1 ring-amber-300'
          }`}
          onClick={() =>
            onFiltroRapido(filtroRapido === 'requiere_revision' ? 'all' : 'requiere_revision')
          }
        >
          Ver solo débiles
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS_RAPIDOS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFiltroRapido(f.id)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
              filtroRapido === f.id
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-indigo-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-emerald-200/90 bg-emerald-50/40 p-2.5 sm:p-3">
        <p className="text-xs font-semibold text-emerald-950">Precisión IA (feedback humano)</p>
        <p className="mt-1 text-[11px] text-emerald-900/90">
          {feedbackMetricas.total > 0
            ? `${feedbackMetricas.precisionPct}% aciertos exactos · ${feedbackMetricas.total} registros de feedback`
            : 'Sin feedback guardado aún. Aplica, corrige o ignora sugerencias para medir precisión.'}
        </p>
        {feedbackMetricas.total > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCard label="IA acertó" value={feedbackMetricas.correctos} tone="emerald" />
            <MetricCard label="IA corregida" value={feedbackMetricas.parciales} tone="amber" />
            <MetricCard label="IA incorrecta" value={feedbackMetricas.incorrectos} tone="red" />
            <MetricCard label="Ignoradas" value={feedbackMetricas.ignorados} tone="slate" />
          </div>
        )}
      </div>

      {feedbackMetricas.total > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          <AgrupacionLista titulo="Top aciertos IA" items={feedbackMetricas.topAciertos} max={5} />
          <AgrupacionLista titulo="Top errores IA" items={feedbackMetricas.topErrores} max={5} />
          <AgrupacionLista
            titulo="Precisión por categoría sugerida"
            items={feedbackMetricas.porCategoriaPrecision}
            max={5}
          />
          <AgrupacionLista
            titulo="Precisión por subtipo sugerido"
            items={feedbackMetricas.porSubtipoPrecision}
            max={5}
          />
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <AgrupacionLista titulo="Por categoría sugerida" items={porCategoria} max={8} />
        <AgrupacionLista titulo="Por subtipo sugerido" items={porSubtipo} max={8} />
        <div className="rounded-lg border border-indigo-200/90 bg-indigo-50/50 p-2.5 sm:p-3">
          <p className="text-xs font-semibold text-indigo-900">Top patrones aprendidos</p>
          {patronesAprendidos.length === 0 ? (
            <p className="mt-2 text-[11px] text-indigo-800/80">
              Aún no hay sugerencias basadas en memoria en este lote. Aplica clasificaciones para enseñar patrones.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-[11px] text-indigo-950">
              {patronesAprendidos.map((p) => (
                <li key={p.key} className="flex justify-between gap-2">
                  <span className="truncate" title={p.label}>
                    {p.label}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{p.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

export default IAClasificacionCalidadPanel;
