import React from 'react';

type Props = {
  rows?: number;
  cols?: number;
  className?: string;
};

/** Filas skeleton para tablas/listas (shimmer suave). */
const SkeletonTableRows: React.FC<Props> = ({ rows = 6, cols = 5, className = '' }) => (
  <div className={`space-y-2 ${className}`} aria-hidden>
    {Array.from({ length: rows }, (_, r) => (
      <div
        key={r}
        className="flex items-center gap-3 rounded-lg border border-gray-50 bg-white px-3 py-3"
      >
        <div className="h-8 w-8 shrink-0 rounded-full shimmer-bg" />
        <div className="flex flex-1 flex-wrap gap-2">
          {Array.from({ length: cols }, (_, c) => (
            <div
              key={c}
              className={`h-3 rounded-md shimmer-bg ${c === cols - 1 ? 'w-16' : 'flex-1 min-w-[3rem]'}`}
            />
          ))}
        </div>
      </div>
    ))}
  </div>
);

export default SkeletonTableRows;
