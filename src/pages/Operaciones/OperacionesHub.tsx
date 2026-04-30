import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Filter } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { buildFleetPanelRows, type EstadoFlota } from '../../utils/fleetPanel';

const SUBLINKS: { title: string; path: string; emoji: string; hint?: string }[] = [
  { title: 'Control global', path: '/operaciones/control-global', emoji: '🧭', hint: 'Resumen y alertas' },
  { title: 'Pendientes', path: '/operaciones/pendientes', emoji: '📌', hint: 'Trabajo pendiente y prioridades' },
  { title: 'Documentación', path: '/operaciones/docs', emoji: '📋', hint: 'SOAT, RT, vencimientos (Supabase)' },
  { title: 'Mantenimiento', path: '/operaciones/mantenimiento', emoji: '🔧', hint: 'Kilometraje y valor tiempo' },
  { title: 'Conductores', path: '/operaciones/conductores', emoji: '👤' },
  { title: 'Valor tiempo', path: '/operaciones/tiempo', emoji: '⏱️' },
];

function badgeEstado(e: EstadoFlota): { cls: string; label: string } {
  if (e === 'CRITICO') return { cls: 'bg-red-100 text-red-800 border-red-200', label: 'Crítico' };
  if (e === 'ALERTA') return { cls: 'bg-amber-100 text-amber-900 border-amber-200', label: 'Alerta' };
  return { cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', label: 'OK' };
}

const OperacionesHub: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sinIngresoFilter = searchParams.get('flota') === 'sinIngreso';
  const { vehicles, ingresos, controlFechas, kilometrajes, conductores } = useRegistrosContext();
  const [soloProblemas, setSoloProblemas] = useState(false);

  const clearFlotaQuery = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('flota');
    setSearchParams(next, { replace: true });
  };

  const fleetRows = useMemo(
    () => buildFleetPanelRows(vehicles, ingresos, controlFechas, kilometrajes, conductores),
    [vehicles, ingresos, controlFechas, kilometrajes, conductores],
  );

  const counts = useMemo(() => {
    let c = 0,
      a = 0,
      o = 0;
    for (const r of fleetRows) {
      if (r.estado === 'CRITICO') c++;
      else if (r.estado === 'ALERTA') a++;
      else o++;
    }
    return { critico: c, alerta: a, ok: o };
  }, [fleetRows]);

  const visible = useMemo(() => {
    if (sinIngresoFilter) {
      return fleetRows.filter((r) => r.alertaPrincipal.startsWith('Sin ingreso'));
    }
    return soloProblemas ? fleetRows.filter((r) => r.estado !== 'OK') : fleetRows;
  }, [fleetRows, soloProblemas, sinIngresoFilter]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Operaciones</h1>
            <p className="text-sm text-gray-500">Estado de la flota y accesos rápidos</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {SUBLINKS.map((l) => (
          <button
            key={l.path}
            type="button"
            title={l.hint ?? l.title}
            onClick={() => navigate(l.path)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:border-primary-300 hover:bg-primary-50/50 transition-colors"
          >
            <span className="text-base leading-none">{l.emoji}</span>
            {l.title}
          </button>
        ))}
      </div>

      {sinIngresoFilter && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <span className="font-semibold">Solo unidades sin ingresos recientes (flota)</span>
          <button type="button" onClick={clearFlotaQuery} className="ml-auto font-semibold text-primary-700 hover:underline">
            Quitar filtro
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-2 rounded-lg bg-red-50 border border-red-100 px-3 py-1 font-semibold text-red-800">
          Crítico: {counts.critico}
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-1 font-semibold text-amber-900">
          Alerta: {counts.alerta}
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-1 font-semibold text-emerald-800">
          OK: {counts.ok}
        </span>
        <button
          type="button"
          onClick={() => {
            if (sinIngresoFilter) clearFlotaQuery();
            setSoloProblemas((v) => !v);
          }}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            soloProblemas && !sinIngresoFilter
              ? 'border-red-300 bg-red-100 text-red-800'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Filter size={12} />
          Solo con problemas
        </button>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[720px]">
            <thead className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="py-2.5 pl-4 pr-2 font-semibold">Unidad</th>
                <th className="py-2.5 px-2 font-semibold text-center w-28">Estado</th>
                <th className="py-2.5 px-2 font-semibold">Alerta principal</th>
                <th className="py-2.5 px-2 font-semibold">Conductor</th>
                <th className="py-2.5 pr-4 pl-2 font-semibold text-right tabular-nums w-28">Último km</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">
                    {sinIngresoFilter
                      ? 'Ninguna unidad cumple el criterio de sin ingreso reciente.'
                      : soloProblemas
                        ? 'Ninguna unidad con alertas.'
                        : 'No hay vehículos activos'}
                  </td>
                </tr>
              ) : (
                visible.map((r) => {
                  const b = badgeEstado(r.estado);
                  const v = r.vehicle;
                  return (
                    <tr
                      key={v.id}
                      className="hover:bg-violet-50/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/vehiculos/${v.id}`)}
                    >
                      <td className="py-2.5 pl-4 pr-2">
                        <p className="font-semibold text-gray-900">{v.placa}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[14rem]">
                          {v.marca} {v.modelo}
                        </p>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${b.cls}`}>
                          {b.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-xs text-gray-800 max-w-[240px]">
                        <span className="line-clamp-2" title={r.alertaPrincipal}>
                          {r.alertaPrincipal}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-xs text-gray-700 max-w-[160px] truncate" title={r.conductorLabel}>
                        {r.conductorLabel}
                      </td>
                      <td className="py-2.5 pr-4 pl-2 text-right tabular-nums text-gray-800 font-medium">
                        {r.ultimoKm != null ? r.ultimoKm.toLocaleString('es-PE') : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {(soloProblemas || sinIngresoFilter) && visible.length > 0 && (
          <div className="border-t border-gray-100 px-4 py-2 text-center">
            <button
              type="button"
              onClick={() => {
                setSoloProblemas(false);
                clearFlotaQuery();
              }}
              className="text-xs font-semibold text-purple-600 hover:underline"
            >
              Ver toda la flota
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OperacionesHub;
