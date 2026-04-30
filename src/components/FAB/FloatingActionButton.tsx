import React, { useState, useEffect, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { useDrawer } from '../../context/DrawerContext';

interface QuickAction {
  icon: string;
  label: string;
  gradient: string;
  type: 'income' | 'expense' | 'discount' | 'maintenance' | 'documentation';
}

const quickActions: QuickAction[] = [
  {
    icon: '💰',
    label: 'Ingreso',
    gradient: 'from-emerald-400 to-teal-500',
    type: 'income',
  },
  {
    icon: '💸',
    label: 'Gasto',
    gradient: 'from-red-400 to-orange-500',
    type: 'expense',
  },
  {
    icon: '🏷️',
    label: 'Descuento',
    gradient: 'from-amber-400 to-yellow-600',
    type: 'discount',
  },
  {
    icon: '🔧',
    label: 'Mantenimiento',
    gradient: 'from-blue-400 to-indigo-500',
    type: 'maintenance',
  },
  {
    icon: '📋',
    label: 'Documentación',
    gradient: 'from-purple-400 to-pink-500',
    type: 'documentation',
  },
];

const FloatingActionButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { open } = useDrawer();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleAction = (type: QuickAction['type']) => {
    setIsOpen(false);
    setTimeout(() => open(type), 100);
  };

  return (
    <div
      ref={containerRef}
      className={`fixed bottom-28 sm:bottom-14 right-4 sm:right-6 flex flex-col items-end gap-3 ${isOpen ? 'z-[45]' : 'z-30'}`}
    >
      {/* Menú: 5 opciones con nombre (lista vertical, sin solapar) */}
      {isOpen && (
        <nav
          role="menu"
          aria-label="Registro rápido"
          className="w-[min(18rem,calc(100vw-2rem))] divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white py-0 shadow-2xl animate-pop-up origin-bottom-right"
        >
          {quickActions.map((action, i) => (
            <button
              key={action.type}
              type="button"
              role="menuitem"
              onClick={() => handleAction(action.type)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100"
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-lg shadow-md ring-2 ring-white ${action.gradient}`}
                aria-hidden
              >
                {action.icon}
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-gray-800">{action.label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* FAB principal */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          relative w-14 h-14 shrink-0 rounded-full shadow-2xl
          flex items-center justify-center
          transition-all duration-300
          hover:scale-110 active:scale-95
          ${isOpen
            ? 'bg-gray-800 rotate-45 ring-4 ring-white/80'
            : 'bg-gradient-to-br from-primary-500 to-secondary-500 animate-pulse-glow'}
        `}
        aria-label={isOpen ? 'Cerrar menú de registro rápido' : 'Menú de registro rápido'}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {isOpen ? (
          <X size={22} className="text-white" />
        ) : (
          <Plus size={24} className="text-white" strokeWidth={2.5} />
        )}
      </button>
    </div>
  );
};

export default FloatingActionButton;
