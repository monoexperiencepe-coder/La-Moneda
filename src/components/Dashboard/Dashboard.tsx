import React, { useMemo } from 'react';
import KPICards from './KPICards';
import IncomeVsExpenses from './IncomeVsExpenses';
import ExpensesByCategory from './ExpensesByCategory';
import TopVehicles from './TopVehicles';
import RecentRegistros from './RecentRegistros';
import Select from '../Common/Select';
import Button from '../Common/Button';
import { Ingreso, Gasto, Descuento, Vehicle, FilterState } from '../../data/types';
import { calculateKPIs, calculateVehicleRentability } from '../../utils/calculations';
import { buildMonthlyChartData } from '../../utils/buildMonthlyChartData';
import { MESES, ANIOS } from '../../data/catalogs';
import { RotateCcw } from 'lucide-react';

interface DashboardProps {
  ingresos: Ingreso[];
  gastos: Gasto[];
  descuentos?: Descuento[];
  vehicles: Vehicle[];
  filters: FilterState;
  onFilterChange: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onResetFilters: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  ingresos, gastos, descuentos = [], vehicles, filters, onFilterChange, onResetFilters
}) => {
  const kpis = useMemo(() => calculateKPIs(ingresos, gastos, descuentos), [ingresos, gastos, descuentos]);
  const vehicleRentability = useMemo(
    () => calculateVehicleRentability(vehicles, ingresos, gastos, descuentos),
    [vehicles, ingresos, gastos, descuentos],
  );
  const chartData = useMemo(
    () => buildMonthlyChartData(filters.anio ?? 2024, ingresos, gastos),
    [filters.anio, ingresos, gastos],
  );

  const vehicleOptions = [
    { value: '', label: 'Todos los vehículos' },
    ...vehicles.filter(v => v.activo).map(v => ({
      value: String(v.id),
      label: `${v.marca} ${v.modelo} (${v.placa})`,
    })),
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Resumen financiero de tu flota</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-32">
            <Select
              options={MESES.map(m => ({ value: m.value, label: m.label }))}
              value={filters.mes ?? ''}
              placeholder="Mes"
              onChange={(v) => onFilterChange('mes', v ? Number(v) : null)}
            />
          </div>
          <div className="w-24">
            <Select
              options={ANIOS.map(a => ({ value: a, label: String(a) }))}
              value={filters.anio ?? ''}
              placeholder="Año"
              onChange={(v) => onFilterChange('anio', v ? Number(v) : null)}
            />
          </div>
          <div className="w-40">
            <Select
              options={vehicleOptions}
              value={filters.vehicleId ? String(filters.vehicleId) : ''}
              placeholder="Vehículo"
              onChange={(v) => onFilterChange('vehicleId', v ? Number(v) : null)}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onResetFilters}
            icon={<RotateCcw size={14} />}
          >
            Limpiar
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <KPICards data={kpis} />

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <IncomeVsExpenses data={chartData} />
        </div>
        <div>
          <ExpensesByCategory gastosPorCategoria={kpis.gastosPorCategoria} />
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div>
          <TopVehicles vehicles={vehicleRentability} />
        </div>
        <div className="xl:col-span-2">
          <RecentRegistros
            ingresos={ingresos}
            gastos={gastos}
            vehicles={vehicles}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
