import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import DescuentoForm from '../../components/Forms/DescuentoForm';
import { formatCurrency, formatDate, todayStr } from '../../utils/formatting';
import { LABEL_CATEGORIA_DESCUENTO } from '../../data/descuentosCatalog';

const Descuentos: React.FC = () => {
  const navigate = useNavigate();
  const { descuentos, vehicles, addDescuento, deleteDescuento, getVehicleLabel } = useRegistrosContext();
  const { open } = useDrawer();

  const todaySum = useMemo(
    () => descuentos.filter(d => d.fecha === todayStr()).reduce((s, d) => s + d.monto, 0),
    [descuentos],
  );
  const totalSum = useMemo(() => descuentos.reduce((s, d) => s + d.monto, 0), [descuentos]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/finanzas')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🏷️ Descuentos</h1>
            <p className="text-sm text-gray-500">{descuentos.length} registros — aparte de gastos, ligados al margen</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => open('discount')}
          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-white rounded-xl text-sm font-bold shadow-soft transition-all"
        >
          + Registrar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
          <p className="text-xs text-amber-800 font-medium mb-1">Rebajes HOY (fecha mov.)</p>
          <p className="text-2xl font-bold text-amber-900">{formatCurrency(todaySum)}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-soft">
          <p className="text-xs text-gray-500 font-medium mb-1">Total rebajes (todos)</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSum)}</p>
        </div>
      </div>

      <DescuentoForm vehicles={vehicles} onSubmit={addDescuento} />

      <div>
        <h2 className="text-base font-bold text-gray-800 mb-3">Historial</h2>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-semibold">Mov.</th>
                <th className="px-4 py-3 font-semibold">Registro</th>
                <th className="px-4 py-3 font-semibold">Vehículo</th>
                <th className="px-4 py-3 font-semibold">Categoría</th>
                <th className="px-4 py-3 font-semibold text-right">Monto</th>
                <th className="px-4 py-3 font-semibold">Notas</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {descuentos.map(d => (
                <tr key={d.id} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3 whitespace-nowrap text-gray-800">{formatDate(d.fecha)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500">{formatDate(d.fechaRegistro)}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-[10rem] truncate" title={getVehicleLabel(d.vehicleId)}>
                    {getVehicleLabel(d.vehicleId)}
                  </td>
                  <td className="px-4 py-3 text-gray-800">{LABEL_CATEGORIA_DESCUENTO[d.categoria]}</td>
                  <td className="px-4 py-3 text-right font-bold text-amber-700">{formatCurrency(d.monto)}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={d.comentarios}>{d.comentarios || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => deleteDescuento(d.id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      aria-label="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {descuentos.length === 0 && (
            <p className="text-center py-10 text-gray-400 text-sm">Sin descuentos registrados</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Descuentos;
