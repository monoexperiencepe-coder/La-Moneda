import React from 'react';
import ExpenseForm from '../Forms/ExpenseForm';
import RegistrosTable from '../Tables/RegistrosTable';
import { Gasto, Vehicle } from '../../data/types';

interface GastosViewProps {
  vehicles: Vehicle[];
  gastos: Gasto[];
  onAdd: (gasto: Omit<Gasto, 'id' | 'createdAt'>) => void;
  onDelete: (id: number) => void;
}

const GastosView: React.FC<GastosViewProps> = ({ vehicles, gastos, onAdd, onDelete }) => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gastos</h1>
        <p className="text-sm text-gray-500 mt-0.5">Registro y categorización de gastos operativos</p>
      </div>
      <ExpenseForm vehicles={vehicles} gastos={gastos} onSubmit={onAdd} />
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-3">Historial de Gastos</h2>
        <RegistrosTable
          mode="gastos"
          gastos={gastos}
          vehicles={vehicles}
          onDeleteGasto={onDelete}
        />
      </div>
    </div>
  );
};

export default GastosView;
