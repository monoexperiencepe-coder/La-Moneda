import { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  cancelNarrativeNavigation,
  consumeNarrativeForPath,
  installNarrativeInterruptHandlers,
  isNarrativeRunning,
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
import { narrativeDevLog } from '../modules/copilot/navigationNarrative/devLog';

type Options = NarrativeRunOptions & {
  /** Resuelve target desde spec URL legacy (sin narrativeSteps). */
  resolveTargetFromSpec?: (spec: CopilotFocusSpec) => HTMLElement | null;
  delayMs?: number;
};

function buildStepsFromUrl(spec: CopilotFocusSpec, searchParams: URLSearchParams): NarrativeStep[] | null {
  const year = searchParams.get('year')?.trim() || undefined;
  const month = spec.highlightMonth ?? searchParams.get('month')?.trim();

  if (month && (spec.scrollTarget === 'income-summary' || !spec.scrollTarget)) {
    const base = buildIngresosStep(month, year, 'ingreso_bruto');
    return [{
      ...base,
      label: spec.highlightLabel?.startsWith('Aquí')
        ? spec.highlightLabel
        : spec.highlightLabel
          ? `Aquí está ${spec.highlightLabel.split('·')[0]?.trim() ?? spec.highlightLabel}`
          : base.label,
      description: spec.highlightLabel && !spec.highlightLabel.startsWith('Aquí')
        ? spec.highlightLabel
        : base.description,
    }];
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
      duration: 4500,
      scroll: true,
      applyMonth: month,
      applyYear: year,
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
  const lastRunIdRef = useRef<string | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => installNarrativeInterruptHandlers(), []);

  useEffect(() => {
    return () => {
      if (isNarrativeRunning()) {
        cancelNarrativeNavigation('unmount');
      }
    };
  }, []);

  useEffect(() => {
    const pathname = location.pathname;
    const pending = peekNarrativeForPath(pathname);
    const spec = parseCopilotFocusFromSearchParams(searchParams);
    const urlSteps = spec ? buildStepsFromUrl(spec, searchParams) : null;
    const steps = pending?.steps?.length ? pending.steps : urlSteps;

    if (!steps?.length) {
      if (import.meta.env.DEV && (spec || pending)) {
        narrativeDevLog('[copilot:narrative:missing]', {
          pathname,
          hasPending: Boolean(pending),
          hasSpec: Boolean(spec),
        });
      }
      return;
    }

    const runId = pending?.id ?? `url-${pathname}-${searchParams.toString()}`;
    if (lastRunIdRef.current === runId) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;

      const consumed = consumeNarrativeForPath(pathname);
      const sequence = consumed ?? {
        id: runId,
        path: pathname,
        steps: urlSteps ?? steps,
        showOverlay: true,
      };

      if (!sequence.steps.length) {
        narrativeDevLog('[copilot:narrative:missing]', { pathname, runId });
        return;
      }

      lastRunIdRef.current = runId;
      const currentOpts = optsRef.current;
      const currentSpec = parseCopilotFocusFromSearchParams(searchParams);

      void runNarrativeSequence(sequence, {
        resolveTarget: (step) => {
          const fromResolver = currentOpts.resolveTarget(step);
          if (fromResolver) return fromResolver;
          if (currentSpec && currentOpts.resolveTargetFromSpec) {
            return currentOpts.resolveTargetFromSpec(currentSpec);
          }
          const t = step.target.trim();
          if (t.startsWith('#') || t.startsWith('.')) {
            return document.querySelector(t) as HTMLElement | null;
          }
          return document.getElementById(t);
        },
        onApplyFilters: currentOpts.onApplyFilters,
        initialDelayMs: 0,
      }).finally(() => {
        if (currentSpec) {
          const next = stripCopilotFocusParams(searchParams);
          setSearchParams(next, { replace: true });
        }
      });
    }, optsRef.current.delayMs ?? 680);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [location.pathname, searchParams, setSearchParams]);
}

export { copilotFocusQueryKeys };
