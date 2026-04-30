import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, Bell, Settings, Home, DollarSign, Car, Wrench, BarChart3, Star } from 'lucide-react';

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
  { label: 'Logros', path: '/logros', icon: <Star size={15} />, emoji: '⭐' },
];

const Header: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-soft">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6">
        <div className="relative flex h-16 items-center">
          {/* Izquierda: inicio compacto + nav desktop (no invade el centro) */}
          <div className="relative z-20 flex min-w-0 flex-1 items-center gap-1 sm:gap-2 pr-2 max-w-[calc(50%-7rem)] lg:max-w-[calc(50%-9rem)]">
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

          {/* Centro: título fijo (no choca: capas + ancho reservado arriba) */}
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-16 sm:px-20">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="pointer-events-auto flex items-center gap-2 rounded-xl px-2 py-1 transition-colors hover:bg-gray-50/90 active:scale-[0.98]"
              aria-label="La Moneda — Ir al inicio"
            >
              <span className="text-lg leading-none select-none sm:text-xl" aria-hidden>
                🪙
              </span>
              <span className="bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-base font-bold tracking-tight text-transparent sm:text-lg">
                LA MONEDA
              </span>
            </button>
          </div>

          {/* Derecha: acciones */}
          <div className="relative z-20 ml-auto flex min-w-0 flex-1 items-center justify-end gap-1 pl-2 max-w-[calc(50%-7rem)] lg:max-w-[calc(50%-9rem)] sm:gap-2 sm:pl-3">
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
            <div className="hidden items-center gap-2 border-l border-gray-200 pl-2 sm:flex">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 text-sm">
                🧑‍💼
              </div>
              <div className="hidden min-w-0 md:block">
                <p className="text-xs font-bold leading-none text-gray-900">Admin</p>
                <p className="mt-0.5 text-[10px] leading-none text-gray-400">La Moneda</p>
              </div>
            </div>
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
