import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../../components/Common/Card';
import { fetchAportesAccionistas } from '../../services/aportesAccionistasService';
import type { AporteAccionista, Moneda } from '../../data/types';
import { formatCurrency, formatDate, formatUSD } from '../../utils/formatting';
import { EMPRESA_ID } from '../../config/app';

function montoFmt(amount: number, moneda: Moneda): string {
  return moneda === 'USD' ? formatUSD(amount) : formatCurrency(amount, 'S/');
}

const AportesPanel: React.FC = () => {
  const [rows, setRows] = useState<AporteAccionista[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!EMPRESA_ID) {
      setRows([]);
      setLoading(false);
      setError('Falta VITE_EMPRESA_ID en el entorno.');
      console.error('[AportesPanel] Falta VITE_EMPRESA_ID');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { rows, error: fetchErr } = await fetchAportesAccionistas();
      setRows(rows);
      setError(fetchErr);
      if (fetchErr) {
        console.error('[AportesPanel] Supabase:', fetchErr, { empresa_id: EMPRESA_ID });
      }
      if (!fetchErr && rows.length === 0) {
        console.warn('[AportesPanel] Lista vacía.', { empresa_id: EMPRESA_ID, revision: 'RLS / import v3' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar aportes';
      setError(msg);
      setRows([]);
      console.error('[AportesPanel] Excepción:', e, { empresa_id: EMPRESA_ID });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totalesPorMoneda = useMemo(() => {
    let pen = 0;
    let usd = 0;
    for (const r of rows) {
      if (r.moneda === 'USD') usd += r.monto;
      else pen += r.monto;
    }
    return { pen, usd };
  }, [rows]);

  const porAccionista = useMemo(() => {
    const map = new Map<string, { pen: number; usd: number }>();
    for (const r of rows) {
      const key = r.accionista.trim() || '(sin nombre)';
      const cur = map.get(key) ?? { pen: 0, usd: 0 };
      if (r.moneda === 'USD') cur.usd += r.monto;
      else cur.pen += r.monto;
      map.set(key, cur);
    }
    return [...map.entries()].sort((a, b) => {
      const ta = a[1].pen + a[1].usd * 4;
      const tb = b[1].pen + b[1].usd * 4;
      return tb - ta;
    });
  }, [rows]);

  return (
    <div className="space-y-3 sm:space-y-4">
      {!loading && EMPRESA_ID && !error ? (
        <p className="text-[11px] text-slate-600 tabular-nums">
          <span className="font-semibold text-slate-800">{rows.length}</span> aporte{rows.length === 1 ? '' : 's'}{' '}
          <span className="text-slate-400">· empresa_id</span>{' '}
          <code className="text-[10px] bg-slate-100 px-1 rounded font-mono">{EMPRESA_ID}</code>
        </p>
      ) : null}
      <div className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-950 leading-snug">
        <strong className="font-semibold">Importante:</strong> No genera interés. Es capital aportado.
      </div>

      {!EMPRESA_ID ? (
        <Card title="Configuración">
          <p className="text-sm text-gray-600">
            Define <code className="text-xs bg-gray-100 px-1 rounded">VITE_EMPRESA_ID</code> para cargar datos.
          </p>
        </Card>
      ) : loading ? (
        <p className="text-xs text-slate-500 py-10 text-center">Cargando aportes…</p>
      ) : error ? (
        <Card title="Error al cargar aportes">
          <p className="text-sm text-red-700">{error}</p>
          <p className="text-xs text-gray-600 mt-2 font-mono break-all">empresa_id: {EMPRESA_ID}</p>
          <p className="text-xs text-gray-500 mt-2">
            Revisa consola, migración <code className="bg-gray-100 px-1 rounded">migration_financiamiento_aportes_prestamos_v3.sql</code> y RLS en{' '}
            <code className="bg-gray-100 px-1 rounded">aportes_accionistas</code>.
          </p>
        </Card>
      ) : rows.length === 0 ? (
        <Card title="Sin aportes">
          <p className="text-sm text-gray-600 mb-2">
            No hay registros visibles en <code className="text-xs bg-gray-100 px-1 rounded">aportes_accionistas</code> para{' '}
            <span className="font-mono text-xs">{EMPRESA_ID}</span>.
          </p>
          <p className="text-xs text-gray-500">Si ya importaste v3, revisa RLS y rol en user_profiles en Supabase.</p>
        </Card>
      ) : (
        <>
          <Card title="Total aportado">
            <div className="flex flex-wrap gap-3 text-sm">
              {totalesPorMoneda.pen > 0 ? (
                <span className="font-semibold text-slate-900">{montoFmt(totalesPorMoneda.pen, 'PEN')}</span>
              ) : null}
              {totalesPorMoneda.usd > 0 ? (
                <span className="font-semibold text-slate-900">{montoFmt(totalesPorMoneda.usd, 'USD')}</span>
              ) : null}
              {totalesPorMoneda.pen === 0 && totalesPorMoneda.usd === 0 ? (
                <span className="text-slate-500">—</span>
              ) : null}
            </div>
          </Card>

          <Card title="Por accionista">
            <ul className="space-y-2 text-sm">
              {porAccionista.map(([nombre, t]) => (
                <li key={nombre} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                  <span className="font-medium text-slate-800">{nombre}</span>
                  <span className="text-slate-600 tabular-nums text-xs sm:text-sm">
                    {t.pen > 0 ? <span className="mr-2">{montoFmt(t.pen, 'PEN')}</span> : null}
                    {t.usd > 0 ? <span>{montoFmt(t.usd, 'USD')}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Lista de aportes">
            <div className="overflow-x-auto -mx-1">
              <table className="min-w-full text-left text-[11px] sm:text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wide">
                    <th className="py-1.5 pr-2 font-medium">Fecha</th>
                    <th className="py-1.5 pr-2 font-medium">Accionista</th>
                    <th className="py-1.5 pr-2 font-medium">Vehículo ref.</th>
                    <th className="py-1.5 pr-2 font-medium text-right">Monto</th>
                    <th className="py-1.5 font-medium">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 align-top">
                      <td className="py-2 pr-2 whitespace-nowrap text-slate-700">{formatDate(r.fechaAporte)}</td>
                      <td className="py-2 pr-2 text-slate-800">{r.accionista}</td>
                      <td className="py-2 pr-2 text-slate-600 max-w-[140px] sm:max-w-[200px] truncate" title={r.vehiculoReferencia ?? ''}>
                        {r.vehiculoReferencia ?? '—'}
                      </td>
                      <td className="py-2 pr-2 text-right font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                        {montoFmt(r.monto, r.moneda)}
                      </td>
                      <td className="py-2 text-slate-500">{r.tipo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.some((r) => r.observaciones.trim()) ? (
              <p className="text-[10px] text-slate-500 mt-2">
                Algunas filas tienen observaciones en el Excel/import — revisar en Supabase si hace falta detalle.
              </p>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
};

export default AportesPanel;
