import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, User, Building2, Bell, Shield, HelpCircle, ChevronRight } from 'lucide-react';

const settingGroups = [
  {
    title: 'Mi Cuenta',
    items: [
      { icon: <User size={18} />, label: 'Perfil de Usuario', desc: 'Nombre, email, avatar', color: 'text-primary-500 bg-primary-50' },
      { icon: <Shield size={18} />, label: 'Seguridad', desc: 'Contraseña, PIN', color: 'text-red-500 bg-red-50' },
    ],
  },
  {
    title: 'Empresa',
    items: [
      { icon: <Building2 size={18} />, label: 'Datos de La Moneda', desc: 'RUC, dirección, contacto', color: 'text-blue-500 bg-blue-50' },
      { icon: <Bell size={18} />, label: 'Notificaciones', desc: 'Alertas de vencimiento', color: 'text-amber-500 bg-amber-50' },
    ],
  },
  {
    title: 'Soporte',
    items: [
      { icon: <HelpCircle size={18} />, label: 'Ayuda & FAQ', desc: 'Documentación del sistema', color: 'text-purple-500 bg-purple-50' },
    ],
  },
];

const Configuracion: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">⚙️ Configuración</h1>
          <p className="text-sm text-gray-500">Personaliza tu experiencia</p>
        </div>
      </div>

      {/* Profile card */}
      <div className="bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl p-6 text-white shadow-soft-md">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-3xl">
            🧑‍💼
          </div>
          <div>
            <h2 className="text-xl font-bold">Administrador</h2>
            <p className="text-indigo-200 text-sm">La Moneda · Trujillo, Perú</p>
            <p className="text-indigo-200 text-xs mt-1">admin@lamoneda.com</p>
          </div>
        </div>
      </div>

      {/* Settings groups */}
      {settingGroups.map(group => (
        <div key={group.title} className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{group.title}</p>
          </div>
          <div className="divide-y divide-gray-50">
            {group.items.map(item => (
              <button key={item.label} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${item.color}`}>
                  {item.icon}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.desc}</p>
                </div>
                <ChevronRight size={16} className="text-gray-300" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Version */}
      <p className="text-center text-xs text-gray-300">La Moneda v2.0 · Sistema de Gestión Financiera</p>
    </div>
  );
};

export default Configuracion;
