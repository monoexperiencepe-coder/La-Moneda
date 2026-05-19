import React from 'react';
import { Loader2 } from 'lucide-react';

type Props = {
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
};

const sizeMap = { sm: 14, md: 18 };

/** Spinner compacto en línea (tablas, filas, chips). */
const InlineLoader: React.FC<Props> = ({
  label = 'Cargando…',
  size = 'sm',
  className = '',
}) => (
  <span
    className={`inline-flex items-center gap-1.5 text-indigo-600 ${className}`}
    role="status"
    aria-live="polite"
  >
    <Loader2 size={sizeMap[size]} className="animate-spin shrink-0" />
    {label ? <span className="text-xs font-medium text-gray-500">{label}</span> : null}
  </span>
);

export default InlineLoader;
