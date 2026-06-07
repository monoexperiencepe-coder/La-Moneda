import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { REGISTROS_ACCESOS, filterRegistrosAccesos, type RegistrosAccesoDef } from '../../config/registrosAccesos';
import { permissionUserFromAuth } from '../../utils/permissions';
import { useIndisponibilidadModal } from '../../context/IndisponibilidadModalContext';

const FloatingRegistrosMenu: React.FC = () => {
  const navigate = useNavigate();
  const { isFinancialOperador, user, profile } = useAuth();
  const { openRegistrar: openIndisponibilidad } = useIndisponibilidadModal();
  const [open, setOpen] = useState(false);

  const menuItems = useMemo(
    () => filterRegistrosAccesos(REGISTROS_ACCESOS, permissionUserFromAuth(user, profile?.email)),
    [user, profile?.email],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (isFinancialOperador) return null;

  const go = (item: RegistrosAccesoDef) => {
    if (item.openModal === 'indisponibilidad') {
      openIndisponibilidad();
      setOpen(false);
      return;
    }
    navigate(item.path);
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
          className="fixed z-[40] flex max-h-[min(72vh,28rem)] w-[calc(100vw-24px)] max-w-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200/95 bg-white shadow-xl shadow-slate-900/12 animate-fade-in
            right-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))]
            sm:right-6 sm:bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))]"
          role="menu"
          aria-label="Registros y accesos"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Registros y accesos
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              aria-label="Cerrar menú de registros"
            >
              <X size={18} />
            </button>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
            {menuItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => go(item)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
                >
                  <span className="shrink-0 text-xl leading-none pt-0.5" aria-hidden>
                    {item.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900">{item.menuLabel}</span>
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
        data-fab="registros-principal"
        className={`
          fixed z-[40] flex h-14 w-14 items-center justify-center rounded-full
          text-white shadow-lg shadow-slate-900/25 transition-all duration-200
          focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500
          right-3 bottom-[max(1.25rem,env(safe-area-inset-bottom,0px))]
          sm:right-6 sm:bottom-6
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
