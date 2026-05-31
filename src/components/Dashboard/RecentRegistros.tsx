import React from 'react';
import { Clock, TrendingUp, TrendingDown } from 'lucide-react';
import Card from '../Common/Card';
import Badge from '../Common/Badge';
import { Ingreso, Gasto, Vehicle } from '../../data/types';
import { formatDate } from '../../utils/formatting';
import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import { ingresoMontoPEN } from '../../utils/moneda';
import { vehicleIdKey } from '../../utils/vehicleId';

interface RecentRegistrosProps {
  ingresos: Ingreso[];
  gastos: Gasto[];
  vehicles: Vehicle[];
  limit?: number;
}

type RecentItem = {
  id: string;
  tipo: 'ingreso' | 'gasto';
  fecha: string;
  descripcion: string;
  vehiculo: string;
  monto: number;
  createdAt: string;
  source: Ingreso | Gasto;
};

const RecentRegistros: React.FC<RecentRegistrosProps> = ({
  ingresos, gastos, vehicles, limit = 8
}) => {
  const { formatRecordAmount } = useAmountDisplay();
  const getVehicleLabel = (vehicleId: number | string | null) => {
    const k = vehicleIdKey(vehicleId);
    if (!k) return 'General';
    const v = vehicles.find((x) => String(x.id) === k);
    return v ? `${v.marca} ${v.modelo}` : `#${k}`;
  };

  const allItems: RecentItem[] = [
    ...ingresos.map(i => ({
      id: `ingreso-${i.id}`,
      tipo: 'ingreso' as const,
      fecha: i.fecha,
      descripcion: i.tipo,
      vehiculo: getVehicleLabel(i.vehicleId),
      monto: ingresoMontoPEN(i),
      createdAt: i.createdAt,
      source: i,
    })),
    ...gastos.map(g => ({
      id: `gasto-${g.id}`,
      tipo: 'gasto' as const,
      fecha: g.fecha,
      descripcion: g.pagadoA?.trim() ? `${g.motivo} → ${g.pagadoA.trim()}` : g.motivo,
      vehiculo: getVehicleLabel(g.vehicleId),
      monto: g.monto,
      createdAt: g.createdAt,
      source: g,
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);

  return (
    <Card title="Últimos Registros" subtitle="Actividad reciente del sistema"
      action={<Clock size={16} className="text-gray-400" />}>
      {allItems.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">Sin registros recientes</div>
      ) : (
        <div className="overflow-x-auto -mx-6">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="bg-gray-50 border-y border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">Tipo</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Fecha</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Descripción</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-3">Vehículo</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-6 py-3">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {allItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3">
                    {item.tipo === 'ingreso' ? (
                      <Badge variant="success" dot>Ingreso</Badge>
                    ) : (
                      <Badge variant="danger" dot>Gasto</Badge>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500">{formatDate(item.fecha)}</td>
                  <td className="px-3 py-3 text-sm text-gray-700 font-medium max-w-[150px] truncate">
                    {item.descripcion}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500">{item.vehiculo}</td>
                  <td className="px-6 py-3 text-right">
                    <span className={`text-sm font-bold ${item.tipo === 'ingreso' ? 'text-emerald-600' : 'text-red-500'}`}>
                      {formatRecordAmount(item.monto, item.source, {
                        signPrefix: item.tipo === 'ingreso' ? '+' : '−',
                      })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export default RecentRegistros;
