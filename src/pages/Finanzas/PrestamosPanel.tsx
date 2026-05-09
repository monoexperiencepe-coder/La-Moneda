import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ChevronDown, Info } from 'lucide-react';
import Card from '../../components/Common/Card';
import { fetchPrestamosFinancierosDetalle } from '../../services/prestamosFinancierosService';
import type {
  Moneda,
  PrestamoFinanciero,
  PrestamoFinancieroCalculoInfo,
  PrestamoFinancieroDetalle,
  PrestamoFinancieroTramo,
} from '../../data/types';
import { calcularPrestamoFinancieroInfo, endOfPreviousMonthIso } from '../../utils/prestamosFinancierosCalc';
import { formatCurrency, formatDate, formatUSD } from '../../utils/formatting';
import { EMPRESA_ID } from '../../config/app';

function montoFmt(amount: number, moneda: Moneda): string {
  return moneda === 'USD' ? formatUSD(amount) : formatCurrency(amount, 'S/');
}

function timelinePeriodLabel(desde: string, hasta: string | null): string {
  const d = desde.trim().slice(0, 10);
  const h = hasta?.trim() ? hasta.trim().slice(0, 10) : '';
  const yStart = d.slice(0, 4);
  if (!h) return `${yStart} → actual`;
  const yEnd = h.slice(0, 4);
  if (yStart === yEnd) return `${formatDate(d)} — ${formatDate(h)}`;
  return `${yStart} → ${yEnd}`;
}

function eventoTimelineLegible(evento: string, nota: string): string {
  const e = evento.trim();
  const n = nota.trim();
  if (!e && !n) return 'Cambio de condiciones';
  if (e.toLowerCase().includes('retiro') || n.toLowerCase().includes('retir'))
    return 'Retiro de capital';
  if (e === 'inicio') return 'Inicio';
  return e ? e.replace(/_/g, ' ') : n.slice(0, 48) + (n.length > 48 ? '…' : '');
}

function modalidadEtiqueta(p: PrestamoFinanciero): string {
  return p.modalidadPago === 'cuota_fija' ? 'Cuota fija mensual' : 'Tasa anual';
}

interface PrestamoCardProps {
  detalle: PrestamoFinancieroDetalle;
  numeroEnLista: number;
}

function PrestamoEjecutivoCard({ detalle, numeroEnLista }: PrestamoCardProps) {
  const { prestamo: p, tramos } = detalle;
  const calc = useMemo(() => calcularPrestamoFinancieroInfo(p, tramos), [p, tramos]);
  const tramosOrdenados = useMemo(
    () => [...tramos].sort((a, b) => a.orden - b.orden || a.id - b.id),
    [tramos],
  );

  const activo = p.estado === 'activo';
  const formulaNote =
    p.modalidadPago === 'cuota_fija'
      ? 'según cuota fija'
      : p.tasaAnual != null
        ? 'capital × tasa / 12'
        : 'registro';

  return (
    <article className="rounded-lg border border-slate-200/90 bg-white shadow-sm shadow-slate-200/20 overflow-hidden">
      <header className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_100%_0%,rgba(99,102,241,0.14),transparent)] pointer-events-none" aria-hidden />
        <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex min-w-0 gap-2 sm:gap-2.5">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15 text-[11px] font-bold text-white ring-1 ring-white/25 tabular-nums sm:h-8 sm:w-8 sm:text-xs"
              aria-label={`Préstamo ${numeroEnLista} de la lista`}
            >
              {numeroEnLista}
            </span>
            <div className="min-w-0 space-y-1">
              <h2 className="text-base sm:text-lg font-semibold tracking-tight text-white leading-tight">
                {p.prestamista || `Préstamo #${p.id}`}
              </h2>
              {p.titulo?.trim() ? (
                <p className="text-[11px] text-white/70 leading-snug truncate" title={p.titulo}>
                  {p.titulo.trim()}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1">
                <span
                  className="inline-flex items-center rounded-md bg-white/15 px-1.5 py-px text-[9px] font-bold text-white ring-1 ring-white/15"
                  title="moneda_capital"
                >
                  Moneda capital: {p.monedaCapital}
                </span>
                <span
                  className="inline-flex items-center rounded-md bg-white/15 px-1.5 py-px text-[9px] font-bold text-white ring-1 ring-white/15"
                  title="moneda_pago"
                >
                  Moneda pago: {p.monedaPago}
                </span>
                <span className="inline-flex items-center rounded-md bg-violet-400/25 px-1.5 py-px text-[9px] font-semibold text-violet-100 ring-1 ring-violet-300/25">
                  {modalidadEtiqueta(p)}
                </span>
                <span
                  className={
                    activo
                      ? 'inline-flex items-center rounded-md bg-emerald-400/20 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-emerald-200 ring-1 ring-emerald-400/30'
                      : 'inline-flex items-center rounded-md bg-white/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-slate-300 ring-1 ring-white/15'
                  }
                >
                  {activo ? 'Activo' : 'Cancelado'}
                </span>
                {p.codigo ? (
                  <span className="text-[9px] text-white/50 font-mono truncate max-w-[180px] sm:max-w-[240px]" title={p.codigo}>
                    {p.codigo}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-start sm:items-end gap-0 rounded-md bg-white/10 px-2.5 py-2 ring-1 ring-white/12 sm:min-w-[160px]">
            <span className="text-[9px] font-medium uppercase tracking-wide text-white/50 leading-none">Interés mensual actual</span>
            <span className="text-xl sm:text-2xl font-bold tabular-nums tracking-tight text-white leading-none mt-0.5">
              {montoFmt(p.interesMensualActual, p.monedaPago)}
            </span>
            <span className="text-[9px] text-white/40 tabular-nums leading-none mt-0.5">
              ≈ {montoFmt(calc.interesMensualEstimado, p.monedaPago)} ({formulaNote})
            </span>
          </div>
        </div>
      </header>

      <div className="px-3 py-2 sm:px-4 sm:py-2.5 bg-slate-50/80">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
          <KpiTile label="Capital original" value={montoFmt(p.montoOriginal, p.monedaCapital)} accent />
          <KpiTile label="Capital actual" value={montoFmt(calc.capitalActualEstimado, p.monedaCapital)} accent />
          <KpiTile label="Moneda capital" value={p.monedaCapital} />
          <KpiTile label="Moneda pago" value={p.monedaPago} />
          <KpiTile label="Modalidad" value={modalidadEtiqueta(p)} />
          {p.modalidadPago === 'cuota_fija' ? (
            <KpiTile
              label="Importe mensual (cuota fija)"
              value={
                p.cuotaFijaMensual != null && Number.isFinite(p.cuotaFijaMensual)
                  ? montoFmt(p.cuotaFijaMensual, p.monedaPago)
                  : montoFmt(p.interesMensualActual, p.monedaPago)
              }
            />
          ) : (
            <KpiTile
              label="Tasa anual"
              value={
                p.tasaAnual != null && Number.isFinite(p.tasaAnual)
                  ? `${(p.tasaAnual * 100).toLocaleString('es-PE', { maximumFractionDigits: 4 })}%`
                  : '—'
              }
            />
          )}
          <KpiTile label="Meses estimados" value={String(calc.mesesPagadosEstimados)} />
          <KpiTile
            label="Total pagado estimado"
            value={montoFmt(calc.totalInteresPagadoEstimado, p.monedaPago)}
            highlight
          />
        </div>
      </div>

      {tramosOrdenados.length > 0 ? (
        <div className="px-3 pb-2 pt-0.5 sm:px-4 sm:pb-2.5">
          <h3 className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Tramos</h3>
          <TramosTimeline tramos={tramosOrdenados} calc={calc} />
        </div>
      ) : (
        <div className="px-3 pb-2 sm:px-4">
          <p className="text-[10px] text-slate-500 bg-slate-50 rounded-md px-2 py-1.5 leading-snug">
            Sin tramos: total estimado con una sola cuota hasta la fecha de corte.
          </p>
        </div>
      )}

      <details className="group border-t border-slate-100 bg-slate-50/60">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-1.5 sm:px-4 text-[11px] font-medium text-slate-600 hover:bg-slate-100/80 transition-colors [&::-webkit-details-marker]:hidden">
          <span>Más información</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-1.5 px-3 pb-2 pt-0 sm:px-4 sm:pb-2.5 text-[11px] text-slate-600">
          <ul className="space-y-0.5 leading-snug">
            <li>
              <span className="text-slate-400">Inicio contrato:</span>{' '}
              <span className="font-medium text-slate-700">{formatDate(p.fechaInicio)}</span>
            </li>
            <li>
              <span className="text-slate-400">Tope estimaciones:</span>{' '}
              <span className="font-medium text-slate-700">{formatDate(calc.fechaTopeCalculo)}</span>
            </li>
            {p.fechaCancelacion ? (
              <li>
                <span className="text-slate-400">Cancelación:</span>{' '}
                <span className="font-medium text-slate-700">{formatDate(p.fechaCancelacion)}</span>
              </li>
            ) : null}
            {p.requiereTramos ? (
              <li>
                <span className="text-slate-400">Tramos:</span>{' '}
                <span className="font-medium text-slate-700">requiere tramos (Excel)</span>
              </li>
            ) : null}
          </ul>
          {(p.observaciones?.trim() || p.notas?.trim()) ? (
            <div className="rounded-md bg-white border border-slate-200/80 px-2 py-1.5 text-[10px] text-slate-600 leading-snug whitespace-pre-wrap">
              {p.observaciones?.trim() || p.notas?.trim()}
            </div>
          ) : null}
        </div>
      </details>
    </article>
  );
}

function KpiTile({
  label,
  value,
  accent,
  highlight,
  className = '',
}: {
  label: string;
  value: string;
  accent?: boolean;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        'rounded-md px-2 py-1.5 border border-slate-200/90 shadow-none',
        highlight
          ? 'bg-indigo-50/90 border-indigo-200/60 text-indigo-950'
          : accent
            ? 'bg-white text-slate-900'
            : 'bg-white text-slate-800',
        className,
      ].join(' ')}
    >
      <p className="text-[8px] font-medium uppercase tracking-wide text-slate-500 mb-0.5 leading-none">{label}</p>
      <p className={`text-xs sm:text-sm font-semibold tabular-nums tracking-tight leading-tight ${highlight ? 'text-indigo-950' : 'text-slate-900'}`}>
        {value}
      </p>
    </div>
  );
}

function TramosTimeline({
  tramos,
  calc,
}: {
  tramos: PrestamoFinancieroTramo[];
  calc: PrestamoFinancieroCalculoInfo;
}) {
  return (
    <div className="relative pl-0 sm:pl-1">
      <div className="absolute left-[5px] sm:left-[9px] top-1 bottom-2 w-px bg-gradient-to-b from-indigo-300/90 via-indigo-200/80 to-transparent" aria-hidden />

      <div className="space-y-0">
        {tramos.map((t, idx) => {
          const linea = calc.porTramo.find((x) => x.tramoId === t.id);
          const monedaCuota = t.monedaPago;
          const cuota = linea != null ? montoFmt(linea.interesMensualEfectivo, monedaCuota) : '—';
          const periodo = timelinePeriodLabel(t.desde, t.hasta);
          const siguiente = tramos[idx + 1];
          const mostrarPuente = idx < tramos.length - 1;
          const refCap =
            t.capitalReferencial != null ? montoFmt(t.capitalReferencial, t.monedaCapital) : null;
          const mesesTxt = linea != null && linea.meses > 0 ? `~${linea.meses} m.` : null;
          const metaLine = [refCap ? `Cap.ref ${refCap}` : null, mesesTxt].filter(Boolean).join(' · ');

          return (
            <div key={t.id} className="relative pb-2.5 last:pb-0">
              <div className="flex gap-2">
                <div className="relative z-[1] mt-1 flex h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-600 ring-1 ring-white shadow-sm" />
                <div className="min-w-0 flex-1 -space-y-px pt-0">
                  <p className="text-[11px] sm:text-xs font-semibold text-slate-800 leading-tight">{periodo}</p>
                  <p className="text-sm sm:text-base font-bold tabular-nums text-indigo-950 leading-tight">
                    {cuota}
                    <span className="text-xs sm:text-sm font-semibold text-indigo-700/85">/mes</span>
                    <span className="text-[9px] font-normal text-slate-500 ml-1">({monedaCuota})</span>
                  </p>
                  {metaLine ? <p className="text-[9px] text-slate-500 leading-tight">{metaLine}</p> : null}
                </div>
              </div>

              {mostrarPuente && siguiente ? (
                <div className="ml-1 sm:ml-2 flex items-center gap-1 py-1 pl-5 sm:pl-6">
                  <ArrowDown className="h-2.5 w-2.5 shrink-0 text-indigo-400" strokeWidth={2.5} aria-hidden />
                  <div className="rounded bg-slate-100 px-1.5 py-px text-[9px] font-medium text-slate-600 leading-tight">
                    {eventoTimelineLegible(siguiente.evento, siguiente.nota)}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PrestamosPanel: React.FC = () => {
  const [detalle, setDetalle] = useState<PrestamoFinancieroDetalle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tramosError, setTramosError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!EMPRESA_ID) {
      setDetalle([]);
      setLoading(false);
      setError('Falta VITE_EMPRESA_ID en el entorno.');
      console.error('[PrestamosPanel] Falta VITE_EMPRESA_ID');
      return;
    }
    setLoading(true);
    setError(null);
    setTramosError(null);
    try {
      const { detalle: rows, error: fetchErr, tramosError: trErr } = await fetchPrestamosFinancierosDetalle();
      setDetalle(rows);
      setError(fetchErr);
      setTramosError(trErr);
      if (fetchErr) {
        console.error('[PrestamosPanel] Supabase préstamos:', fetchErr, { empresa_id: EMPRESA_ID });
      }
      if (trErr) {
        console.error('[PrestamosPanel] Supabase tramos:', trErr, { empresa_id: EMPRESA_ID });
      }
      if (!fetchErr && rows.length === 0) {
        console.warn('[PrestamosPanel] Lista vacía.', { empresa_id: EMPRESA_ID, revision: 'RLS / import / empresa_id' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar préstamos';
      setError(msg);
      setDetalle([]);
      console.error('[PrestamosPanel] Excepción:', e, { empresa_id: EMPRESA_ID });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const topeLabel = endOfPreviousMonthIso();

  const detalleOrdenado = useMemo(() => {
    return [...detalle].sort((a, b) => {
      const ca = a.prestamo.capitalActualEstimado;
      const cb = b.prestamo.capitalActualEstimado;
      if (cb !== ca) return cb - ca;
      const ia = a.prestamo.interesMensualActual;
      const ib = b.prestamo.interesMensualActual;
      if (ib !== ia) return ib - ia;
      return b.prestamo.id - a.prestamo.id;
    });
  }, [detalle]);

  return (
    <div className="space-y-3 sm:space-y-4">
      {!loading && EMPRESA_ID && !error ? (
        <p className="text-[11px] text-slate-600 tabular-nums">
          <span className="font-semibold text-slate-800">{detalle.length}</span> préstamo{detalle.length === 1 ? '' : 's'}{' '}
          <span className="text-slate-400">· empresa_id</span>{' '}
          <code className="text-[10px] bg-slate-100 px-1 rounded font-mono">{EMPRESA_ID}</code>
        </p>
      ) : null}
      {tramosError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-950">
          No se pudieron cargar los tramos: {tramosError}. Revisa consola y RLS en{' '}
          <code className="text-[10px] bg-white/80 px-1 rounded">prestamos_tramos</code>.
        </div>
      ) : null}
      <details className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden group">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 sm:px-3 text-[11px] text-slate-600 hover:bg-slate-50 transition-colors [&::-webkit-details-marker]:hidden">
          <Info className="h-3 w-3 shrink-0 text-indigo-500" aria-hidden />
          <span className="font-medium text-slate-700">Acerca de estos números</span>
          <ChevronDown className="ml-auto h-3 w-3 text-slate-400 transition-transform group-open:rotate-180 shrink-0" aria-hidden />
        </summary>
        <div className="px-2.5 pb-2 pt-0 sm:px-3 text-[10px] sm:text-[11px] text-slate-600 leading-snug border-t border-slate-100 bg-slate-50/50">
          <p className="pt-1.5">
            Vista solo informativa: tablas <code className="text-[10px] bg-slate-200/80 px-1 rounded">prestamos_financieros</code> y{' '}
            <code className="text-[10px] bg-slate-200/80 px-1 rounded">prestamos_tramos</code> en Supabase. No incluye la tabla de gastos ni la categoría{' '}
            <code className="text-[10px] bg-slate-200/80 px-1 rounded">financiero_prestamo</code>.
            Estimaciones hasta el mes anterior (
            <strong className="text-slate-800">{formatDate(topeLabel)}</strong>
            ). Totales de cuota en moneda de pago.
          </p>
        </div>
      </details>

      {!EMPRESA_ID ? (
        <Card title="Configuración">
          <p className="text-sm text-gray-600">
            Define <code className="text-xs bg-gray-100 px-1 rounded">VITE_EMPRESA_ID</code> para cargar datos.
          </p>
        </Card>
      ) : loading ? (
        <p className="text-xs text-slate-500 py-10 text-center">Cargando préstamos…</p>
      ) : error ? (
        <Card title="Error al cargar préstamos">
          <p className="text-sm text-red-700">{error}</p>
          <p className="text-xs text-gray-600 mt-2 font-mono break-all">empresa_id: {EMPRESA_ID}</p>
          <p className="text-xs text-gray-500 mt-2">
            Revisa la consola del navegador (mensaje Supabase), migración v3 y políticas RLS para{' '}
            <code className="bg-gray-100 px-1 rounded">prestamos_financieros</code>.
          </p>
        </Card>
      ) : detalle.length === 0 ? (
        <Card title="Sin préstamos">
          <p className="text-sm text-gray-600 mb-3">
            No hay filas visibles para <span className="font-mono text-xs">{EMPRESA_ID}</span> (tabla vacía o RLS sin coincidencia).
          </p>
          <details className="text-sm text-gray-600 rounded-lg bg-gray-50 px-3 py-2">
            <summary className="cursor-pointer font-medium text-gray-700">Qué revisar en Supabase</summary>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-xs text-gray-600">
              <li>Importar o ejecutar seed de préstamos si la tabla está vacía.</li>
              <li>
                Coincidencia de <code className="bg-gray-100 px-1 rounded">empresa_id</code> con{' '}
                <code className="bg-gray-100 px-1 rounded">VITE_EMPRESA_ID</code>.
              </li>
              <li>
                Permisos RLS y rol en <code className="bg-gray-100 px-1 rounded">user_profiles</code>.
              </li>
            </ul>
          </details>
        </Card>
      ) : (
        <div className="flex flex-col gap-3 sm:gap-3.5">
          {detalleOrdenado.map((row, idx) => (
            <PrestamoEjecutivoCard key={row.prestamo.id} detalle={row} numeroEnLista={idx + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export default PrestamosPanel;
