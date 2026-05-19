import React from 'react';
import { Loader2 } from 'lucide-react';
import { useDelayedLoading } from '../../hooks/useDelayedLoading';

type Props = {
  active: boolean;
  message?: string;
  submessage?: string;
  /** fixed = pantalla; contained = solo el padre relative */
  variant?: 'fixed' | 'contained';
  className?: string;
};

/**
 * Overlay suave premium. Solo visible si `active` supera ~250ms.
 */
const LoadingOverlay: React.FC<Props> = ({
  active,
  message = 'Cargando información…',
  submessage,
  variant = 'contained',
  className = '',
}) => {
  const { showLoader, showMessage } = useDelayedLoading(active);

  if (!showLoader) return null;

  const position =
    variant === 'fixed'
      ? 'fixed inset-0 z-[120]'
      : 'absolute inset-0 z-20 rounded-[inherit]';

  return (
    <div
      className={`${position} flex items-center justify-center bg-white/75 backdrop-blur-[2px] ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-indigo-100/80 bg-white/95 px-6 py-5 shadow-soft-md">
        <Loader2 size={28} className="animate-spin text-indigo-500" strokeWidth={2} />
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-800">{message}</p>
          {showMessage && submessage ? (
            <p className="mt-1 text-xs text-gray-500">{submessage}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default LoadingOverlay;
