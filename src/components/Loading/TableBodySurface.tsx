import React from 'react';
import SkeletonTableRows from './SkeletonTableRows';

type Props = {
  pending?: boolean;
  updating?: boolean;
  skeletonRows?: number;
  minHeight?: string;
  children: React.ReactNode;
  /** Si true y no pending, muestra empty en lugar de children */
  isEmpty?: boolean;
  empty?: React.ReactNode;
};

/** Barra superior sutil al recalcular — contenido permanece a plena visibilidad. */
export function UpdatingChrome({ active }: { active?: boolean }) {
  if (!active) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[2px] overflow-hidden rounded-t-[inherit]"
      aria-hidden
    >
      <div className="h-full w-full bg-gradient-to-r from-transparent via-indigo-200/80 to-transparent">
        <div className="h-full w-[28%] animate-[shimmer_1.35s_ease-in-out_infinite] rounded-full bg-indigo-400/45 blur-[0.3px]" />
      </div>
    </div>
  );
}

/**
 * Envuelve cuerpo de tabla/lista: skeleton en bootstrap, shimmer superior al recalcular.
 */
const TableBodySurface: React.FC<Props> = ({
  pending = false,
  updating = false,
  skeletonRows = 6,
  minHeight = 'min-h-[18rem]',
  children,
  isEmpty = false,
  empty,
}) => {
  if (pending) {
    return (
      <div className={`${minHeight} px-3 py-3`} aria-busy="true" aria-label="Cargando registros">
        <SkeletonTableRows rows={skeletonRows} cols={5} />
      </div>
    );
  }

  return (
    <div className={`relative ${minHeight}`} aria-busy={updating || undefined}>
      <UpdatingChrome active={updating} />
      <div className="transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]">
        {isEmpty && empty ? empty : children}
      </div>
    </div>
  );
};

export default TableBodySurface;
