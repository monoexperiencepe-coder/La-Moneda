import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';
import {
  TOAST_DEFAULT_MS,
  TOAST_ENTER_MS,
  TOAST_EXIT_MS,
} from '../../config/toastTiming';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  /** Botón de acción (p. ej. Deshacer). */
  action?: ToastAction;
  /** Se invoca al cerrar o expirar el toast (limpiar undo pendiente). */
  onDismiss?: () => void;
}

interface ToastItemProps {
  toast: ToastMessage;
  onRemove: (id: string) => void;
}

const toastConfig = {
  success: {
    icon: CheckCircle,
    bgClass: 'bg-emerald-50 border-emerald-200',
    iconClass: 'text-emerald-500',
    titleClass: 'text-emerald-800',
    msgClass: 'text-emerald-600',
    iconSize: 24 as const,
    cardClass: 'min-w-[min(22rem,calc(100vw-3rem))] max-w-md p-5 gap-3.5',
    titleSize: 'text-base',
    msgSize: 'text-sm',
  },
  error: {
    icon: XCircle,
    bgClass: 'bg-red-50 border-red-200',
    iconClass: 'text-red-500',
    titleClass: 'text-red-800',
    msgClass: 'text-red-600',
    iconSize: 20 as const,
    cardClass: 'min-w-72 max-w-sm p-4 gap-3',
    titleSize: 'text-sm',
    msgSize: 'text-xs',
  },
  warning: {
    icon: AlertCircle,
    bgClass: 'bg-amber-50 border-amber-200',
    iconClass: 'text-amber-500',
    titleClass: 'text-amber-800',
    msgClass: 'text-amber-600',
    iconSize: 20 as const,
    cardClass: 'min-w-72 max-w-sm p-4 gap-3',
    titleSize: 'text-sm',
    msgSize: 'text-xs',
  },
  info: {
    icon: Info,
    bgClass: 'bg-blue-50 border-blue-200',
    iconClass: 'text-blue-500',
    titleClass: 'text-blue-800',
    msgClass: 'text-blue-600',
    iconSize: 20 as const,
    cardClass: 'min-w-72 max-w-sm p-4 gap-3',
    titleSize: 'text-sm',
    msgSize: 'text-xs',
  },
};

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const config = toastConfig[toast.type];
  const Icon = config.icon;
  const animMs = exiting ? TOAST_EXIT_MS : TOAST_ENTER_MS;

  const dismiss = React.useCallback(() => {
    setExiting(true);
    setVisible(false);
    window.setTimeout(() => {
      toast.onDismiss?.();
      onRemove(toast.id);
    }, TOAST_EXIT_MS);
  }, [toast, onRemove]);

  useEffect(() => {
    const enterRaf = requestAnimationFrame(() => setVisible(true));
    const timer = window.setTimeout(dismiss, toast.duration ?? TOAST_DEFAULT_MS);
    return () => {
      cancelAnimationFrame(enterRaf);
      clearTimeout(timer);
    };
  }, [toast.id, toast.duration, dismiss]);

  const sz = config.iconSize;
  const cardExtra = config.cardClass;
  const titleSz = config.titleSize;
  const msgSz = config.msgSize;

  return (
    <div
      className={`
        flex items-start rounded-xl border shadow-soft-md ease-out
        ${cardExtra}
        ${config.bgClass}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
      `}
      style={{
        transitionProperty: 'opacity, transform',
        transitionDuration: `${animMs}ms`,
        transitionTimingFunction: 'ease-out',
      }}
    >
      <Icon size={sz} className={`flex-shrink-0 mt-0.5 ${config.iconClass}`} />
      <div className="flex-1 min-w-0">
        <p className={`${titleSz} font-semibold ${config.titleClass}`}>{toast.title}</p>
        {toast.message && (
          <p className={`${msgSz} mt-1 ${config.msgClass}`}>{toast.message}</p>
        )}
        {toast.action && (
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => {
              setActionBusy(true);
              void Promise.resolve(toast.action!.onClick()).finally(() => setActionBusy(false));
            }}
            className={`mt-2.5 inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
              toast.type === 'success'
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60'
                : 'bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-60'
            }`}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Cerrar"
      >
        <X size={sz >= 22 ? 16 : 14} />
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onRemove={onRemove} />
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
