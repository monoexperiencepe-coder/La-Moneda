import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Lock } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { ingresoMontoPEN } from '../../utils/moneda';

interface Achievement {
  id: string;
  emoji: string;
  title: string;
  description: string;
  unlocked: boolean;
  progress?: number;
  max?: number;
  color: string;
}

const Logros: React.FC = () => {
  const navigate = useNavigate();
  const { ingresos, gastos, vehicles, kilometrajes } = useRegistrosContext();

  const totalIngresos = ingresos.length;
  const totalGastos = gastos.length;
  const totalVehicles = vehicles.filter(v => v.activo).length;
  const totalKmRegistros = kilometrajes.length;
  const netMargin =
    ingresos.reduce((s, i) => s + ingresoMontoPEN(i), 0) - gastos.reduce((s, g) => s + g.monto, 0);

  const achievements: Achievement[] = [
    { id: 'first_income', emoji: '💰', title: 'Primer Ingreso', description: 'Registraste tu primer ingreso', unlocked: totalIngresos >= 1, color: 'from-emerald-400 to-teal-500' },
    { id: 'income_10', emoji: '🎯', title: '10 Ingresos', description: 'Registraste 10 ingresos', unlocked: totalIngresos >= 10, progress: totalIngresos, max: 10, color: 'from-green-400 to-emerald-500' },
    { id: 'income_50', emoji: '🏆', title: '50 Ingresos', description: 'Eres un experto en registros', unlocked: totalIngresos >= 50, progress: totalIngresos, max: 50, color: 'from-yellow-400 to-amber-500' },
    { id: 'first_expense', emoji: '📊', title: 'Primer Gasto', description: 'Registraste tu primer gasto', unlocked: totalGastos >= 1, color: 'from-red-400 to-orange-500' },
    { id: 'fleet_5', emoji: '🚗', title: 'Flota de 5', description: 'Tienes 5 vehículos activos', unlocked: totalVehicles >= 5, progress: totalVehicles, max: 5, color: 'from-blue-400 to-indigo-500' },
    { id: 'profitable', emoji: '💎', title: 'Rentable', description: 'Margen neto positivo', unlocked: netMargin > 0, color: 'from-primary-400 to-secondary-500' },
    { id: 'km_5', emoji: '🔧', title: 'Kilometraje activo', description: '5 registros de km en Supabase', unlocked: totalKmRegistros >= 5, progress: totalKmRegistros, max: 5, color: 'from-gray-400 to-gray-600' },
    { id: 'big_earner', emoji: '🌟', title: 'Gran Ganador', description: 'Margen neto mayor a S/ 10,000', unlocked: netMargin >= 10000, color: 'from-yellow-400 to-orange-500' },
  ];

  const unlocked = achievements.filter(a => a.unlocked).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">⭐ Logros</h1>
          <p className="text-sm text-gray-500">{unlocked} de {achievements.length} desbloqueados</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-gray-700">Progreso Total</span>
          <span className="text-sm font-bold text-primary-600">{unlocked}/{achievements.length}</span>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-secondary-500 rounded-full transition-all duration-700"
            style={{ width: `${(unlocked / achievements.length) * 100}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">{Math.round((unlocked / achievements.length) * 100)}% completado</p>
      </div>

      {/* Achievement grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {achievements.map((ach) => (
          <div
            key={ach.id}
            className={`rounded-2xl p-5 border-2 transition-all duration-300
              ${ach.unlocked
                ? 'border-transparent shadow-soft-md bg-white'
                : 'border-gray-100 bg-gray-50 opacity-70'}`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-soft
                ${ach.unlocked ? `bg-gradient-to-br ${ach.color}` : 'bg-gray-200'}`}>
                {ach.unlocked ? ach.emoji : <Lock size={20} className="text-gray-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className={`text-sm font-bold ${ach.unlocked ? 'text-gray-900' : 'text-gray-500'}`}>
                    {ach.title}
                  </h3>
                  {ach.unlocked && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full font-semibold">
                      ✓ Desbloqueado
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400">{ach.description}</p>
                {ach.progress !== undefined && ach.max && !ach.unlocked && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                      <span>Progreso</span>
                      <span>{ach.progress}/{ach.max}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-400 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (ach.progress / ach.max) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Logros;
