import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  clearCopilotHighlight,
  highlightCopilotTarget,
  parseCopilotFocusFromSearchParams,
  stripCopilotFocusParams,
  type CopilotFocusSpec,
} from '../modules/copilot/copilotFocusTarget';

type Options = {
  /** Retorna el elemento a resaltar según el spec de la URL. */
  resolveTarget: (spec: CopilotFocusSpec) => HTMLElement | null;
  /** Delay antes de scroll (ms) — espera render de datos. */
  delayMs?: number;
  /** Dependencias extra que deben estabilizarse antes de intentar focus. */
  deps?: unknown[];
};

/**
 * Lee highlightMonth / highlightVehicle de la URL, scroll + glow al dato, limpia params.
 */
export function useCopilotFocusFromUrl(opts: Options): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedRef = useRef<string>('');

  useEffect(() => {
    const spec = parseCopilotFocusFromSearchParams(searchParams);
    if (!spec) return;

    const signature = JSON.stringify(spec);
    if (appliedRef.current === signature) return;

    const timer = window.setTimeout(() => {
      const el = opts.resolveTarget(spec);
      if (!el) return;
      appliedRef.current = signature;
      highlightCopilotTarget(el, spec.highlightLabel);
      const next = stripCopilotFocusParams(searchParams);
      setSearchParams(next, { replace: true });
    }, opts.delayMs ?? 650);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams, ...(opts.deps ?? [])]);

  useEffect(() => () => clearCopilotHighlight(), []);
}
