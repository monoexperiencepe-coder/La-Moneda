import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
  /** Si true, no cierra con ESC, backdrop ni X (p. ej. guardando). */
  closeLocked?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  footer,
  closeLocked = false,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !closeLocked) onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose, closeLocked, isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain"
      role="presentation"
    >
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm animate-fade-in"
        aria-hidden
        onClick={() => {
          if (!closeLocked) onClose();
        }}
      />
      <div className="flex min-h-full justify-center p-4 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'modal-title' : undefined}
          className={`
            relative my-auto flex w-full flex-col
            ${sizeClasses[size]} max-h-[min(calc(100dvh-2rem),calc(100vh-2rem))]
            overflow-hidden bg-white rounded-2xl shadow-soft-lg animate-fade-in
          `}
          onClick={(e) => e.stopPropagation()}
        >
          {title && (
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 id="modal-title" className="pr-4 text-lg font-semibold text-gray-900">
                {title}
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (!closeLocked) onClose();
                }}
                disabled={closeLocked}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            {children}
          </div>
          {footer ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
