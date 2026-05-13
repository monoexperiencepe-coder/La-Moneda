import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

export interface ColumnCountHintThProps {
  /** Texto de ayuda (tooltip nativo + panel al pulsar el icono). */
  hint: string;
  /** Etiqueta corta de la columna (p. ej. Movs). */
  label?: string;
  className?: string;
  /** Controles extra debajo de la etiqueta (p. ej. filtros del ranking). */
  controls?: React.ReactNode;
}

/**
 * Cabecera de columna de conteo (nº de registros): etiqueta + icono.
 * `title` en toda la celda (hover) y clic en el icono abre/cierra un panel fijo (no queda recortado por tablas con scroll).
 */
export function ColumnCountHintTh({
  hint,
  label = 'Movs',
  className = '',
  controls,
}: ColumnCountHintThProps) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();

  const updateBox = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = 256;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    setBox({ top: r.bottom + 6, left });
  }, []);

  useEffect(() => {
    if (open) updateBox();
    else setBox(null);
  }, [open, updateBox]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => updateBox();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, updateBox]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <th
      scope="col"
      className={`relative min-w-[4.75rem] py-2.5 pr-2 text-right align-top font-semibold tabular-nums ${className}`}
      title={hint}
    >
      <div className="flex flex-col items-end gap-1">
        <span className="inline-flex items-center justify-end gap-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <span>{label}</span>
          <button
            ref={btnRef}
            type="button"
            className="-m-0.5 rounded p-0.5 text-slate-400 transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
            aria-label={`Información: ${hint}`}
            aria-expanded={open}
            aria-controls={tooltipId}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            <Info size={13} strokeWidth={2.25} aria-hidden />
          </button>
        </span>
        {controls ? <div className="w-full font-normal normal-case">{controls}</div> : null}
      </div>
      {open && box
        ? createPortal(
            <div
              ref={panelRef}
              id={tooltipId}
              role="tooltip"
              style={{ top: box.top, left: box.left }}
              className="fixed z-[100] w-64 max-w-[min(16rem,calc(100vw-1rem))] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-slate-700 shadow-lg ring-1 ring-slate-900/5"
            >
              {hint}
            </div>,
            document.body,
          )
        : null}
    </th>
  );
}
