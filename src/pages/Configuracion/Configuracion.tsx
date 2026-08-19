import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { roleDisplayLabel } from '../../config/userRolesUi';
import PaymentAccountsSettings from '../../components/Configuracion/PaymentAccountsSettings';

const Configuracion: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">⚙️ Configuración</h1>
          <p className="text-sm text-gray-500">Perfil y administración del sistema</p>
        </div>
      </div>

      <PaymentAccountsSettings />

      <div className="bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl p-6 text-white shadow-soft-md">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-3xl">
            🧑‍💼
          </div>
          <div>
            <h2 className="text-xl font-bold">{user.name}</h2>
            <p className="text-indigo-200 text-sm">La Moneda · Trujillo, Perú</p>
            <p className="text-indigo-200 text-xs mt-1">Rol: {roleDisplayLabel(user.role)}</p>
          </div>
        </div>
      </div>

      {isAdmin ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Administración</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/usuarios')}
            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left border-b border-gray-50"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-violet-600 bg-violet-100">
              👥
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Usuarios y roles</p>
              <p className="text-xs text-gray-400">Admin y contador únicamente (sin borrar cuentas).</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/historial-sistema')}
            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left border-b border-gray-50"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-indigo-600 bg-indigo-100">
              🧾
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Historial del sistema</p>
              <p className="text-xs text-gray-400">Auditoría financiera de cambios y correcciones.</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/devolucion-garantia-preview')}
            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-amber-700 bg-amber-100">
              🔍
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Preview · devoluciones garantía</p>
              <p className="text-xs text-gray-400">
                Reclasificación planificada operativo → financiero (solo lectura, sin aplicar).
              </p>
            </div>
          </button>
        </div>
      ) : null}

      <p className="text-center text-xs text-gray-400 max-w-md mx-auto">
        Opciones de perfil, seguridad y notificaciones estarán disponibles en una próxima versión.
      </p>

      <p className="text-center text-xs text-gray-300">La Moneda v2.0 · Sistema de Gestión Financiera</p>
    </div>
  );
};

export default Configuracion;
