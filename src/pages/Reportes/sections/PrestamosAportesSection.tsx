import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useRegistrosContext } from '../../../context/RegistrosContext';
import { fetchAportesAccionistas, aporteMontoNeto } from '../../../services/aportesAccionistasService';
import { fetchPrestamosFinancierosDetalle } from '../../../services/prestamosFinancierosService';
import { calcularPrestamoFinancieroInfo } from '../../../utils/prestamosFinancierosCalc';
import { formatCurrency, formatDate } from '../../../utils/formatting';
import type { AporteAccionista, PrestamoFinancieroDetalle } from '../../../data/types';

const PrestamosAportesSection: React.FC = () => {
  const { prestamoAbonos } = useRegistrosContext();
  const [prestamos, setPrestamos] = useState<PrestamoFinancieroDetalle[]>([]);
  const [aportes, setAportes] = useState<AporteAccionista[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, aRes] = await Promise.all([fetchPrestamosFinancierosDetalle(), fetchAportesAccionistas()]);
      setPrestamos(pRes.detalle);
      setAportes(aRes.rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resumen = useMemo(() => {
    const activos = prestamos.filter((d) => d.prestamo.estado === 'activo');
    let cuotaMensualEst = 0;
    let capitalEst = 0;
    for (const d of activos) {
      const calc = calcularPrestamoFinancieroInfo(d.prestamo, d.tramos);
      cuotaMensualEst += calc.interesMensualEstimado;
      capitalEst += calc.capitalActualEstimado;
    }
    const totalAportes = aportes.reduce((s, a) => s + aporteMontoNeto(a), 0);
    return {
      totalPrestamos: prestamos.length,
      activos: activos.length,
      cuotaMensualEst,
      capitalEst,
      totalAportes,
      aportesCount: aportes.length,
    };
  }, [prestamos, aportes]);

  const movimientosRecientes = useMemo(() => {
    const fromAbonos = prestamoAbonos.map((a) => ({
      fecha: a.fecha,
      label: `Abono préstamo #${a.prestamoId}`,
      monto: a.monto,
      tipo: 'abono' as const,
    }));
    const fromAportes = aportes.map((a) => ({
      fecha: a.fechaAporte,
      label: `Aporte · ${a.accionista}`,
      monto: aporteMontoNeto(a),
      tipo: 'aporte' as const,
    }));
    return [...fromAbonos, ...fromAportes]
      .filter((m) => m.fecha)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 8);
  }, [prestamoAbonos, aportes]);

  return (
    <section className="space-y-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Préstamos y aportes</h2>
          <p className="mt-1 text-sm text-slate-600">Resumen ejecutivo de financiamiento interno.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          aria-label="Actualizar"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Préstamos registrados" value={String(resumen.totalPrestamos)} sub={`${resumen.activos} activos`} />
        <StatCard
          label="Cuota mensual estimada"
          value={formatCurrency(resumen.cuotaMensualEst)}
          sub="Suma préstamos activos"
        />
        <StatCard label="Capital referencial est." value={formatCurrency(resumen.capitalEst)} sub="Aproximado" />
        <StatCard
          label="Aportes registrados"
          value={formatCurrency(resumen.totalAportes)}
          sub={`${resumen.aportesCount} movimiento${resumen.aportesCount === 1 ? '' : 's'}`}
        />
      </div>

      <p className="text-sm text-slate-600">
        <Link to="/finanzas/financiamiento" className="font-semibold text-indigo-700 underline decoration-indigo-300">
          Abrir módulo de financiamiento
        </Link>{' '}
        para detalle, cuotas y edición.
      </p>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-900">Movimientos recientes</h3>
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">Cargando…</p>
        ) : movimientosRecientes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">Sin movimientos recientes.</p>
        ) : (
          <ul className="divide-y divide-slate-50">
            {movimientosRecientes.map((m) => (
              <li key={`${m.tipo}-${m.fecha}-${m.label}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 text-slate-800">
                  <span className="block font-medium">{m.label}</span>
                  <span className="text-xs text-slate-400">{formatDate(m.fecha)}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-800">{formatCurrency(m.monto)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-800/90">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

export default PrestamosAportesSection;
