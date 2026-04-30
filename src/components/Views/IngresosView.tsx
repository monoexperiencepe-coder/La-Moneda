import React from 'react';
import IncomeForm from '../Forms/IncomeForm';
import RegistrosTable from '../Tables/RegistrosTable';
import { Ingreso, Vehicle } from '../../data/types';

interface IngresosViewProps {
  vehicles: Vehicle[];
  ingresos: Ingreso[];
  onAdd: (ingreso: Omit<Ingreso, 'id' | 'createdAt'>) => void;
  onDelete: (id: number) => void;
}

const IngresosView: React.FC<IngresosViewProps> = ({ vehicles, ingresos, onAdd, onDelete }) => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ingresos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Registro y listado de ingresos de la flota</p>
      </div>
      <IncomeForm vehicles={vehicles} ingresos={ingresos} onSubmit={onAdd} />
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-3">Historial de Ingresos</h2>
        <RegistrosTable
          mode="ingresos"
          ingresos={ingresos}
          vehicles={vehicles}
          onDeleteIngreso={onDelete}
        />
      </div>
    </div>
  );
};

export default IngresosView;
