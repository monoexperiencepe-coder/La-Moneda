import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, Bell, Settings, Home, DollarSign, Car, Wrench, BarChart3, Target, LogOut, Undo2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUndoAction } from '../../context/UndoActionContext';
import { useRegistrosContext } from '../../context/RegistrosContext';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  socio: 'Socio',
  contador: 'Contador',
  operador: 'Operador',
};

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  emoji: string;
}

const navItems: NavItem[] = [
  { label: 'Inicio', path: '/', icon: <Home size={15} />, emoji: '🏠' },
  { label: 'Finanzas', path: '/finanzas', icon: <DollarSign size={15} />, emoji: '💰' },
  { label: 'Vehículos', path: '/vehiculos', icon: <Car size={15} />, emoji: '🚗' },
  { label: 'Operaciones', path: '/operaciones', icon: <Wrench size={15} />, emoji: '🔧' },
  { label: 'Reportes', path: '/reportes', icon: <BarChart3 size={15} />, emoji: '📊' },
  { label: 'Metas', path: '/metas', icon: <Target size={15} />, emoji: '🎯' },
];

const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const { executeUndo, pendingLabel, sessionUndoConsumed, undoRunning } = useUndoAction();
  const { toast } = useRegistrosContext();

  const undoDisabled = sessionUndoConsumed || !pendingLabel || undoRunning;
  const undoTitle = sessionUndoConsumed
    ? 'Ya usaste deshacer en esta sesión. Recarga la página para volver a tenerlo.'
    : !pendingLabel
      ? 'No hay acción reciente para deshacer (eliminar, mover categoría, etc.).'
      : `Deshacer una vez: ${pendingLabel}`;

  const handleGlobalUndo = async () => {
    const label = pendingLabel;
    const res = await executeUndo();
    if (res === 'ok') {
      toast.success('Cambios revertidos', label ? `Se revirtió: ${label}` : 'Última acción deshecha.');
    } else if (res === 'fail') {
      toast.error('No se pudo deshacer', 'Revisa conexión, permisos o intenta de nuevo.');
    }
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-soft">
      <div className="mx-auto max-w-screen-2xl px-3 sm:px-6">
        {/* Rejilla 3 columnas: el título ya no usa absolute (evita solapamiento en móvil) */}
        <div className="grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">
          {/* Izquierda: inicio compacto + nav desktop */}
          <div className="relative z-20 flex min-w-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 text-lg shadow-soft transition-shadow hover:shadow-glow"
              aria-label="Ir al inicio"
            >
              🪙
            </button>
            <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto lg:flex [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {navItems.map(item => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={`flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium transition-all duration-200 xl:gap-1.5 xl:px-2.5 xl:text-sm
                    ${isActive(item.path)
                      ? 'bg-primary-50 text-primary-600'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'}`}
                >
                  {item.icon}
                  <span className="hidden xl:inline">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Centro: título acotado al hueco real (truncate en pantallas estrechas) */}
          <div className="relative z-10 flex min-w-0 justify-center px-1 sm:px-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex min-w-0 max-w-full items-center gap-1.5 rounded-xl px-1.5 py-1 transition-colors hover:bg-gray-50/90 active:scale-[0.98] sm:gap-2 sm:px-2"
              aria-label="La Moneda — Ir al inicio"
            >
              <span className="flex-shrink-0 text-base leading-none select-none sm:text-lg" aria-hidden>
                🪙
              </span>
              <span className="truncate bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-sm font-bold tracking-tight text-transparent sm:text-base md:text-lg">
                LA MONEDA
              </span>
            </button>
          </div>

          {/* Derecha: acciones (orden fijo; en móvil el deshacer lleva más contraste si hay acción pendiente) */}
          <div className="relative z-20 flex shrink-0 items-center justify-end gap-0.5 sm:gap-1.5">
            <button
              type="button"
              onClick={() => void handleGlobalUndo()}
              disabled={undoDisabled}
              className={`relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
                undoDisabled
                  ? 'cursor-not-allowed text-gray-300 bg-gray-50/90'
                  : 'border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100/80 hover:bg-indigo-100/90 hover:ring-indigo-200'
              }`}
              aria-label="Deshacer última acción"
              title={undoTitle}
            >
              <Undo2 size={18} strokeWidth={2.25} className={undoRunning ? 'animate-pulse' : ''} />
            </button>
            <button
              type="button"
              className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-50"
              aria-label="Notificaciones"
            >
              <Bell size={18} />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/configuracion')}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-50"
              aria-label="Configuración"
            >
              <Settings size={18} />
            </button>
            <button
              type="button"
              onClick={() => navigate('/configuracion')}
              className="hidden items-center gap-2 border-l border-gray-200 pl-2 sm:flex rounded-lg py-1 pr-1 -my-1 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
              aria-label="Ir a configuración y perfil"
              title="Configuración / perfil"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-sm">
                🧑‍💼
              </div>
              <div className="hidden min-w-0 md:block">
                <p className="text-xs font-bold leading-none text-gray-900 truncate max-w-[110px]">{user.name}</p>
                <p className="mt-0.5 text-[10px] leading-none text-gray-400">{ROLE_LABEL[user.role] ?? user.role}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut size={17} />
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-50 lg:hidden"
              aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-gray-100 bg-white px-4 py-3 animate-scale-in lg:hidden">
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                void handleGlobalUndo();
                setMobileOpen(false);
              }}
              disabled={undoDisabled}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                undoDisabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-50 text-indigo-800 border border-indigo-100'
              }`}
              title={undoTitle}
            >
              <Undo2 size={16} />
              Deshacer
            </button>
          </div>
          <nav className="grid grid-cols-3 gap-2">
            {navItems.map(item => (
              <button
                key={item.path}
                type="button"
                onClick={() => { navigate(item.path); setMobileOpen(false); }}
                className={`flex flex-col items-center gap-1 rounded-xl py-3 px-2 text-xs font-medium transition-all
                  ${isActive(item.path)
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-500 hover:bg-gray-50'}`}
              >
                <span className="text-xl">{item.emoji}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
