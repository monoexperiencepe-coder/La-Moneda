import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  cancelNarrativeNavigation,
  consumeNarrativeForPath,
  installNarrativeInterruptHandlers,
  peekNarrativeForPath,
  runNarrativeSequence,
  type NarrativeRunOptions,
  type NarrativeStep,
} from '../modules/copilot/navigationNarrative';
import {
  copilotFocusQueryKeys,
  parseCopilotFocusFromSearchParams,
  stripCopilotFocusParams,
  type CopilotFocusSpec,
} from '../modules/copilot/copilotFocusTarget';
import { buildIngresosStep } from '../modules/copilot/navigationNarrative/buildFromAction';
import { aiFocusDevLog } from '../modules/copilot/navigationNarrative/devLog';

type Options = NarrativeRunOptions & {
  /** Resuelve target desde spec URL legacy (sin narrativeSteps). */
  resolveTargetFromSpec?: (spec: CopilotFocusSpec) => HTMLElement | null;
  delayMs?: number;
  deps?: unknown[];
};

function specToNarrativeSteps(spec: CopilotFocusSpec): NarrativeStep[] | null {
  if (spec.highlightMonth && (spec.scrollTarget === 'income-summary' || !spec.scrollTarget)) {
    return [
      buildIngresosStep(spec.highlightMonth, undefined, 'ingreso_bruto'),
    ].map((s) => ({
      ...s,
      label: spec.highlightLabel ?? s.label,
    }));
  }

  if (spec.scrollTarget || spec.highlightVehicle) {
    const target =
      spec.scrollTarget === 'gastos-table'
        ? 'copilot-gastos-table'
        : spec.scrollTarget === 'inversiones-table'
          ? 'copilot-inversiones-table'
          : spec.scrollTarget === 'income-summary'
            ? 'copilot-income-summary'
            : 'copilot-scroll-target';

    return [{
      target,
      label: spec.highlightLabel ?? 'Dato destacado',
      highlightType: spec.highlightVehicle ? 'warning' : 'neutral',
      duration: 4000,
      scroll: true,
      applyMonth: spec.highlightMonth,
    }];
  }

  return null;
}

/**
 * Ejecuta narrative navigation (multi-step) o fallback a focus URL legacy.
 */
export function useCopilotNarrativeNavigation(opts: Options): void {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedRef = useRef<string>('');

  useEffect(() => installNarrativeInterruptHandlers(), []);

  useEffect(() => {
    const pathname = location.pathname;
    const signature = `${pathname}?${searchParams.toString()}`;
    if (appliedRef.current === signature) return;

    const pending = peekNarrativeForPath(pathname);
    const spec = parseCopilotFocusFromSearchParams(searchParams);
    const legacySteps = spec ? specToNarrativeSteps(spec) : null;
    const steps = pending?.steps ?? legacySteps;

    if (!steps?.length) return;

    appliedRef.current = signature;

    const timer = window.setTimeout(() => {
      aiFocusDevLog('[ai-focus:start]', {
        pathname,
        pending: Boolean(pending),
        legacy: Boolean(legacySteps),
        steps: steps.length,
      });

      const sequence =
        consumeNarrativeForPath(pathname) ??
        (pending ?? {
          id: `legacy-${Date.now()}`,
          path: pathname,
          steps: legacySteps ?? [],
          showOverlay: true,
        });

      if (!sequence.steps.length) return;

      void runNarrativeSequence(sequence, {
        resolveTarget: (step) => {
          const fromResolver = opts.resolveTarget(step);
          if (fromResolver) return fromResolver;
          if (spec && opts.resolveTargetFromSpec) {
            return opts.resolveTargetFromSpec(spec);
          }
          const t = step.target.trim();
          if (t.startsWith('#') || t.startsWith('.')) {
            return document.querySelector(t) as HTMLElement | null;
          }
          return document.getElementById(t);
        },
        onApplyFilters: opts.onApplyFilters,
        initialDelayMs: 0,
      }).finally(() => {
        if (spec) {
          const next = stripCopilotFocusParams(searchParams);
          setSearchParams(next, { replace: true });
        }
      });
    }, opts.delayMs ?? 680);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, searchParams, setSearchParams, ...(opts.deps ?? [])]);

  useEffect(() => () => cancelNarrativeNavigation(), []);
}

export { copilotFocusQueryKeys };
