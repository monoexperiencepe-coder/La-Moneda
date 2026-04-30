import React, { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, TrendingUp, TrendingDown, Wrench, FileText } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { formatCurrency, formatDate, formatUSD, isExpiringSoon, isExpired } from '../../utils/formatting';
import { ingresoMontoPEN } from '../../utils/moneda';
import { LABEL_CATEGORIA_DESCUENTO } from '../../data/descuentosCatalog';
import Badge from '../../components/Common/Badge';

const VehiculoDetalle: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { vehicles, ingresos, gastos, descuentos, mantenimientos, documentaciones } = useRegistrosContext();

  const vehicle = vehicles.find(v => v.id === Number(id));

  const vehicleIngresos = useMemo(() => ingresos.filter(i => i.vehicleId === Number(id)), [ingresos, id]);
  const vehicleGastos = useMemo(() => gastos.filter(g => g.vehicleId === Number(id)), [gastos, id]);
  const vehicleDescuentos = useMemo(() => descuentos.filter(d => d.vehicleId === Number(id)), [descuentos, id]);
  const vehicleMantenimientos = useMemo(() => mantenimientos.filter(m => m.vehicleId === Number(id)), [mantenimientos, id]);
  const vehicleDocs = useMemo(() => documentaciones.filter(d => d.vehicleId === Number(id)), [documentaciones, id]);

  const totalIngresos = vehicleIngresos.reduce((s, i) => s + ingresoMontoPEN(i), 0);
  const totalGastos = vehicleGastos.reduce((s, g) => s + g.monto, 0);
  const totalDescuentos = vehicleDescuentos.reduce((s, d) => s + d.monto, 0);
  const margen = totalIngresos - totalGastos + totalDescuentos;

  if (!vehicle) {
    return (
      <div className="text-center py-20">
        <p className="text-5xl mb-4">🔍</p>
        <p className="text-gray-500">Vehículo no encontrado</p>
        <button onClick={() => navigate('/vehiculos')} className="mt-4 text-primary-500 hover:underline text-sm">
          Volver al inventario
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/vehiculos/inventario')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl flex items-center justify-center text-2xl shadow-soft-md">
            🚙
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{vehicle.marca} {vehicle.modelo}</h1>
            <p className="text-gray-500 font-mono text-sm">{vehicle.placa}</p>
          </div>
          <Badge variant={vehicle.activo ? 'success' : 'neutral'} dot>
            {vehicle.activo ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-center gap-4">
          <TrendingUp size={22} className="text-emerald-500 flex-shrink-0" />
          <div>
            <p className="text-xs text-emerald-600 font-medium">Total Ingresos</p>
            <p className="text-xl font-bold text-emerald-700">{formatCurrency(totalIngresos)}</p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 flex items-center gap-4">
          <TrendingDown size={22} className="text-red-500 flex-shrink-0" />
          <div>
            <p className="text-xs text-red-600 font-medium">Total Gastos</p>
            <p className="text-xl font-bold text-red-700">{formatCurrency(totalGastos)}</p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 flex items-center gap-4">
          <span className="text-2xl flex-shrink-0" aria-hidden>🏷️</span>
          <div>
            <p className="text-xs text-amber-800 font-medium">Rebajes (descuentos)</p>
            <p className="text-xl font-bold text-amber-900">{formatCurrency(totalDescuentos)}</p>
          </div>
        </div>
        <div className={`border rounded-2xl p-5 flex items-center gap-4 ${margen >= 0 ? 'bg-primary-50 border-primary-100' : 'bg-gray-50 border-gray-100'}`}>
          <span className="text-2xl flex-shrink-0">{margen >= 0 ? '💰' : '📉'}</span>
          <div>
            <p className="text-xs text-gray-600 font-medium">Margen Neto</p>
            <p className={`text-xl font-bold ${margen >= 0 ? 'text-primary-700' : 'text-gray-700'}`}>{formatCurrency(margen)}</p>
          </div>
        </div>
      </div>

      {/* Recent ingresos */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><TrendingUp size={16} className="text-emerald-500" /> Últimos Ingresos</h3>
          <span className="text-xs text-gray-400">{vehicleIngresos.length} registros</span>
        </div>
        <div className="divide-y divide-gray-50">
          {vehicleIngresos.slice(0, 5).map(i => (
            <div key={i.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">{i.tipo}</p>
                <p className="text-xs text-gray-400">{formatDate(i.fecha)}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {i.metodoPago}
                  {i.metodoPagoDetalle ? ` · ${i.metodoPagoDetalle}` : ''}
                </p>
              </div>
              <span className="text-sm font-bold text-emerald-600">
                {i.moneda === 'USD' ? (
                  <>
                    +{formatUSD(i.monto)}
                    <span className="block text-[10px] font-normal text-gray-500">≈ {formatCurrency(ingresoMontoPEN(i))}</span>
                  </>
                ) : (
                  <>+{formatCurrency(i.monto)}</>
                )}
              </span>
            </div>
          ))}
          {vehicleIngresos.length === 0 && (
            <p className="text-center py-6 text-sm text-gray-400">Sin ingresos registrados</p>
          )}
        </div>
      </div>

      {/* Recent gastos */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><TrendingDown size={16} className="text-red-500" /> Últimos Gastos</h3>
          <span className="text-xs text-gray-400">{vehicleGastos.length} registros</span>
        </div>
        <div className="divide-y divide-gray-50">
          {vehicleGastos.slice(0, 5).map(g => (
            <div key={g.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">{g.motivo}</p>
                <p className="text-xs text-gray-400">{formatDate(g.fecha)}</p>
                {g.pagadoA?.trim() && (
                  <p className="text-xs text-gray-700 mt-0.5 font-medium">→ {g.pagadoA}</p>
                )}
                <p className="text-xs text-gray-500 mt-0.5">
                  {g.metodoPago}
                  {g.metodoPagoDetalle ? ` · ${g.metodoPagoDetalle}` : ''}
                </p>
              </div>
              <span className={`text-sm font-bold ${g.monto < 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {g.monto < 0 ? `−${formatCurrency(Math.abs(g.monto))}` : `−${formatCurrency(g.monto)}`}
              </span>
            </div>
          ))}
          {vehicleGastos.length === 0 && (
            <p className="text-center py-6 text-sm text-gray-400">Sin gastos registrados</p>
          )}
        </div>
      </div>

      {/* Descuentos / rebajes */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><span className="text-base" aria-hidden>🏷️</span> Descuentos (módulo aparte)</h3>
          <span className="text-xs text-gray-400">{vehicleDescuentos.length} registros</span>
        </div>
        <div className="divide-y divide-gray-50">
          {vehicleDescuentos.slice(0, 5).map(d => (
            <div key={d.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-gray-800">{LABEL_CATEGORIA_DESCUENTO[d.categoria]}</p>
                <p className="text-xs text-gray-400">Mov. {formatDate(d.fecha)} · Reg. {formatDate(d.fechaRegistro)}</p>
                {d.comentarios?.trim() && (
                  <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[14rem]" title={d.comentarios}>{d.comentarios}</p>
                )}
              </div>
              <span className="text-sm font-bold text-amber-700">{formatCurrency(d.monto)}</span>
            </div>
          ))}
          {vehicleDescuentos.length === 0 && (
            <p className="text-center py-6 text-sm text-gray-400">Sin descuentos para este vehículo</p>
          )}
        </div>
      </div>

      {/* Documentación */}
      {vehicleDocs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-800 flex items-center gap-2"><FileText size={16} className="text-purple-500" /> Documentación</h3>
          </div>
          <div className="p-5 space-y-2">
            {vehicleDocs.slice(0, 3).map(d => {
              const expired = isExpired(d.soat) || isExpired(d.rtParticular) || isExpired(d.rtDetaxi);
              const expiring = isExpiringSoon(d.soat) || isExpiringSoon(d.rtParticular) || isExpiringSoon(d.rtDetaxi);
              return (
                <div key={d.id} className="flex items-center justify-between">
                  <p className="text-sm text-gray-700">{d.motivo}</p>
                  <Badge variant={expired ? 'danger' : expiring ? 'warning' : 'success'}>
                    {expired ? 'Vencido' : expiring ? 'Por vencer' : 'OK'}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default VehiculoDetalle;
