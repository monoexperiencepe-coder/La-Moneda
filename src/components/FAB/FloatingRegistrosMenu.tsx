import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

type MenuItem = {
  emoji: string;
  label: string;
  hint: string;
  path: string;
};

/** Mismos accesos que «Acciones rápidas» en Inicio; ingreso/gasto abren siempre el formulario detallado. */
const MENU_ITEMS: MenuItem[] = [
  {
    emoji: '💵',
    label: 'Registrar ingreso',
    hint: 'Formulario completo (Finanzas)',
    path: '/finanzas/ingresos?registrar=1',
  },
  {
    emoji: '💸',
    label: 'Registrar gasto',
    hint: 'Formulario completo (Finanzas)',
    path: '/finanzas/gastos?registrar=1',
  },
  {
    emoji: '🛠️',
    label: 'Kilometraje',
    hint: 'Control de km',
    path: '/operaciones/mantenimiento',
  },
  {
    emoji: '📋',
    label: 'Vencimiento',
    hint: 'Documento / fecha',
    path: '/operaciones/docs',
  },
  {
    emoji: '📌',
    label: 'Pendiente',
    hint: 'Tarea operativa',
    path: '/operaciones/pendientes',
  },
];

const FloatingRegistrosMenu: React.FC = () => {
  const navigate = useNavigate();
  const { isFinancialOperador } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (isFinancialOperador) return null;

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <>
      {open ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[35] bg-slate-900/20 backdrop-blur-[1px] animate-fade-in"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {open ? (
        <div
          className="fixed bottom-[5.5rem] right-4 z-[40] w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200/95 bg-white shadow-xl shadow-slate-900/12 animate-fade-in sm:right-6 sm:bottom-24"
          role="menu"
          aria-label="Registros y accesos"
        >
          <p className="border-b border-slate-100 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Registros y accesos
          </p>
          <ul className="max-h-[min(70vh,22rem)] overflow-y-auto p-1.5">
            {MENU_ITEMS.map((item) => (
              <li key={item.path}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => go(item.path)}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                  <span className="text-xl leading-none shrink-0 pt-0.5" aria-hidden>
                    {item.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-slate-900">{item.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{item.hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? 'Cerrar menú de registros' : 'Abrir menú de registros'}
        className={`
          fixed bottom-6 right-4 z-[40] flex h-14 w-14 items-center justify-center rounded-full
          text-white shadow-lg shadow-slate-900/25 transition-all duration-200
          focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500
          sm:right-6
          ${open
            ? 'bg-slate-700 hover:bg-slate-600 rotate-0'
            : 'bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 hover:scale-105 active:scale-95'}
        `}
      >
        {open ? <X size={26} strokeWidth={2.25} /> : <Plus size={28} strokeWidth={2.25} />}
      </button>
    </>
  );
};

export default FloatingRegistrosMenu;
