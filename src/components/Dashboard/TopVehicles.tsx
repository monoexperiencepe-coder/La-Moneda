import React from 'react';
import { Award, Car } from 'lucide-react';
import Card from '../Common/Card';
import { VehicleRentability } from '../../data/types';
import { formatCurrency } from '../../utils/formatting';

interface TopVehiclesProps {
  vehicles: VehicleRentability[];
}

const rankColors = [
  'from-yellow-400 to-amber-500',
  'from-gray-300 to-gray-400',
  'from-amber-600 to-amber-700',
  'from-primary-400 to-primary-500',
  'from-purple-400 to-purple-500',
];

const TopVehicles: React.FC<TopVehiclesProps> = ({ vehicles }) => {
  const top5 = vehicles.slice(0, 5);

  return (
    <Card title="Top 5 Vehículos más Rentables" subtitle="Ordenado por margen neto">
      {top5.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          Sin datos disponibles
        </div>
      ) : (
        <div className="space-y-3 mt-2">
          {top5.map((item, index) => {
            const maxMargen = top5[0].margen || 1;
            const pct = Math.max(0, (item.margen / maxMargen) * 100);

            return (
              <div key={item.vehicle.id} className="flex items-center gap-4">
                {/* Rank badge */}
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${rankColors[index]} flex items-center justify-center flex-shrink-0 shadow-soft`}>
                  <span className="text-white text-xs font-bold">{index + 1}</span>
                </div>

                {/* Vehicle info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Car size={13} className="text-gray-400 flex-shrink-0" />
                      <span className="text-sm font-semibold text-gray-800 truncate">
                        {item.vehicle.marca} {item.vehicle.modelo}
                      </span>
                      <span className="text-xs text-gray-400 hidden sm:inline">
                        ({item.vehicle.placa})
                      </span>
                    </div>
                    <span className={`text-sm font-bold flex-shrink-0 ml-2 ${item.margen >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {formatCurrency(item.margen)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${rankColors[index]} rounded-full transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default TopVehicles;
