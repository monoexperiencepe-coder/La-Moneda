import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Banknote, CalendarClock, CarFront } from 'lucide-react';
import type { OperativeAlertItem, OperativeAlertKind } from '../../utils/buildOperativeAlerts';

const KIND_META: Record<
  OperativeAlertKind,
  { label: string; icon: React.ReactNode; accent: string }
> = {
  INGRESO_PENDIENTE: {
    label: 'Cobros marcados pendientes',
    icon: <Banknote size={16} className="text-amber-600" />,
    accent: 'border-amber-200 bg-amber-50/80',
  },
  VENCIMIENTO: {
    label: 'Vencimientos próximos',
    icon: <CalendarClock size={16} className="text-orange-600" />,
    accent: 'border-orange-200 bg-orange-50/70',
  },
  SIN_INGRESOS: {
    label: 'Sin ingresos recientes',
    icon: <CarFront size={16} className="text-violet-600" />,
    accent: 'border-violet-200 bg-violet-50/70',
  },
};

interface OperativeAlertsPanelProps {
  alerts: OperativeAlertItem[];
  /** Máximo de filas por categoría */
  maxPerKind?: number;
  className?: string;
}

const OperativeAlertsPanel: React.FC<OperativeAlertsPanelProps> = ({
  alerts,
  maxPerKind = 8,
  className = '',
}) => {
  const navigate = useNavigate();

  const grouped = useMemo(() => {
    const order: OperativeAlertKind[] = ['INGRESO_PENDIENTE', 'VENCIMIENTO', 'SIN_INGRESOS'];
    const map = new Map<OperativeAlertKind, OperativeAlertItem[]>();
    order.forEach((k) => map.set(k, []));
    for (const a of alerts) {
      map.get(a.kind)?.push(a);
    }
    return order.map((kind) => ({
      kind,
      items: (map.get(kind) ?? []).slice(0, maxPerKind),
      total: map.get(kind)?.length ?? 0,
    }));
  }, [alerts, maxPerKind]);

  const totalAll = alerts.length;
  if (totalAll === 0) {
    return (
      <div
        className={`rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-800 ${className}`}
      >
        <span className="font-semibold">Alertas automáticas:</span>{' '}
        <span className="text-emerald-700">
          todo en orden (sin cobros pendientes detectados, vencimientos en ventana ni vehículos sin ingresos
          recientes).
        </span>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center gap-2 text-gray-900">
        <AlertTriangle size={18} className="text-amber-500 shrink-0" />
        <h2 className="text-base font-bold">Alertas automáticas</h2>
        <span className="text-xs font-medium text-gray-500">
          ({totalAll} activa{totalAll !== 1 ? 's' : ''})
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {grouped.map(({ kind, items, total }) => {
          const meta = KIND_META[kind];
          const hidden = total - items.length;
          return (
            <div key={kind} className={`rounded-2xl border p-4 shadow-soft ${meta.accent}`}>
              <div className="flex items-center gap-2 mb-3">
                {meta.icon}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-800 uppercase tracking-wide">{meta.label}</p>
                  <p className="text-[11px] text-gray-600">
                    {total} caso{total !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <ul className="space-y-2 max-h-[220px] overflow-y-auto">
                {items.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => navigate(a.href)}
                      className={`w-full text-left rounded-xl px-3 py-2 bg-white/90 border border-white hover:border-gray-200 hover:shadow-sm transition-all ${
                        a.severity === 'alta' ? 'ring-1 ring-red-100/80' : ''
                      }`}
                    >
                      <p className="text-xs font-semibold text-gray-900 line-clamp-2">{a.title}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{a.detail}</p>
                    </button>
                  </li>
                ))}
              </ul>
              {hidden > 0 && (
                <p className="text-[10px] text-gray-500 mt-2 text-center">+{hidden} más en esta categoría</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OperativeAlertsPanel;
