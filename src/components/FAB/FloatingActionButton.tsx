import React, { useState, useEffect, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDrawer } from '../../context/DrawerContext';
import type { DrawerType } from '../../context/DrawerContext';

type DrawerAction = {
  kind: 'drawer';
  type: Exclude<DrawerType, null>;
  icon: string;
  label: string;
  subtitle?: string;
  gradient: string;
};

type NavigateAction = {
  kind: 'nav';
  path: string;
  icon: string;
  label: string;
  subtitle?: string;
  gradient: string;
};

type FabAction = DrawerAction | NavigateAction;

type FabSection = { title: string; actions: FabAction[] };

const sections: FabSection[] = [
  {
    title: 'Finanzas (Supabase)',
    actions: [
      { kind: 'drawer', type: 'income', icon: '💰', label: 'Ingreso', gradient: 'from-emerald-400 to-teal-500' },
      { kind: 'drawer', type: 'expense', icon: '💸', label: 'Gasto', gradient: 'from-red-400 to-orange-500' },
      {
        kind: 'nav',
        path: '/finanzas/financiamiento',
        icon: '📒',
        label: 'Financiamiento',
        subtitle: 'Préstamos y aportes',
        gradient: 'from-sky-400 to-blue-600',
      },
      {
        kind: 'nav',
        path: '/finanzas/descuentos',
        icon: '🏷️',
        label: 'Rebajes / descuentos',
        subtitle: 'Fact',
        gradient: 'from-amber-400 to-orange-600',
      },
      {
        kind: 'nav',
        path: '/finanzas/caja-negocio',
        icon: '🏪',
        label: 'Caja negocio',
        subtitle: 'Por vehículo',
        gradient: 'from-teal-400 to-cyan-600',
      },
    ],
  },
  {
    title: 'Operaciones',
    actions: [
      {
        kind: 'nav',
        path: '/operaciones/mantenimiento',
        icon: '🔧',
        label: 'Kilometraje',
        subtitle: 'Mantenimiento · km',
        gradient: 'from-violet-400 to-purple-600',
      },
      {
        kind: 'nav',
        path: '/operaciones/docs',
        icon: '📋',
        label: 'Vencimientos',
        subtitle: 'SOAT, RT, documentos',
        gradient: 'from-indigo-400 to-blue-700',
      },
      {
        kind: 'nav',
        path: '/operaciones/pendientes',
        icon: '📌',
        label: 'Pendiente',
        subtitle: 'Tareas y prioridades',
        gradient: 'from-rose-400 to-red-600',
      },
      {
        kind: 'nav',
        path: '/operaciones/tiempo',
        icon: '⏱️',
        label: 'Valor tiempo',
        subtitle: 'Registro tiempo Supabase',
        gradient: 'from-cyan-400 to-teal-600',
      },
    ],
  },
  {
    title: 'Flota y personas',
    actions: [
      {
        kind: 'nav',
        path: '/vehiculos/inventario',
        icon: '🚗',
        label: 'Vehículos',
        subtitle: 'Inventario · altas típicamente en Supabase',
        gradient: 'from-blue-400 to-indigo-600',
      },
      {
        kind: 'nav',
        path: '/operaciones/conductores',
        icon: '👤',
        label: 'Conductores',
        subtitle: 'Listado y fichas',
        gradient: 'from-emerald-500 to-green-700',
      },
      {
        kind: 'nav',
        path: '/operaciones/control-global',
        icon: '🧭',
        label: 'Control global',
        subtitle: 'Resumen multiregistro · unidades · doc',
        gradient: 'from-slate-500 to-gray-700',
      },
    ],
  },
];

const FloatingActionButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { open } = useDrawer();
  const navigate = useNavigate();
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

  const runAction = (a: FabAction) => {
    setIsOpen(false);
    if (a.kind === 'drawer') {
      setTimeout(() => open(a.type), 80);
      return;
    }
    setTimeout(() => navigate(a.path), 80);
  };

  return (
    <div
      ref={containerRef}
      style={{
        right: 'max(0.9rem, env(safe-area-inset-right))',
        bottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
      className={`fixed flex flex-col items-end gap-3 ${isOpen ? 'z-[45]' : 'z-30'}`}
    >
      {isOpen && (
        <nav
          role="menu"
          aria-label="Acceso rápido a registros y pantallas que guardan en Supabase"
          className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-gray-100 bg-white shadow-2xl animate-pop-up origin-bottom-right max-h-[min(72vh,calc(100vh-10rem))] flex flex-col overflow-hidden"
        >
          <div className="shrink-0 px-3 py-2.5 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Accesos rápidos</p>
          </div>
          <div className="overflow-y-auto overscroll-contain divide-y divide-gray-100 px-2 py-1.5">
            {sections.map((sec, si) => (
              <div key={sec.title} className={si > 0 ? 'pt-1.5' : ''}>
                <p className="px-2 pt-1.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{sec.title}</p>
                {sec.actions.map((action, ai) => (
                  <button
                    key={action.kind === 'drawer' ? `d-${action.type}` : `${action.path}`}
                    type="button"
                    role="menuitem"
                    onClick={() => runAction(action)}
                    className="flex w-full items-start gap-3 px-2.5 py-2.5 text-left rounded-xl transition-colors hover:bg-gray-50 active:bg-gray-100"
                    style={{ animationDelay: `${(si * 6 + ai) * 28}ms` }}
                  >
                    <span
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-lg shadow-md ring-2 ring-white ${action.gradient}`}
                      aria-hidden
                    >
                      {action.icon}
                    </span>
                    <span className="min-w-0 flex-1 pt-0.5">
                      <span className="block text-sm font-semibold text-gray-800">{action.label}</span>
                      {(action.kind === 'nav' ? action.subtitle : undefined) && (
                        <span className="mt-0.5 block text-[11px] text-gray-500 leading-snug">
                          {(action as NavigateAction).subtitle}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`
          relative w-[58px] h-[58px] shrink-0 rounded-full
          flex items-center justify-center
          transition-all duration-300 ease-out
          hover:scale-105 active:scale-95
          ${isOpen
            ? 'bg-slate-800 rotate-45 ring-4 ring-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.35)]'
            : 'bg-gradient-to-br from-primary-500 to-secondary-500 ring-1 ring-white/70 shadow-[0_10px_30px_rgba(99,102,241,0.45)] animate-pulse-glow'}
        `}
        aria-label={isOpen ? 'Cerrar menú de registro rápido' : 'Menú de registro rápido'}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {!isOpen && (
          <>
            <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-white/15 to-white/35" />
            <span className="pointer-events-none absolute -inset-1 rounded-full bg-primary-500/30 blur-md -z-10" />
          </>
        )}
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
