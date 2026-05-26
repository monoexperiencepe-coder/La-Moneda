import type { NarrativeSequence, NarrativeRunOptions, NarrativeStep } from './types';
import { cinematicScrollToElement } from './scroll';
import { cancelAIFocusMode, deactivateAIFocusMode } from './aiFocusMode';
import { applyNarrativeHighlight, waitMs } from './highlight';
import { fadeOutCopilotCallout, removeCopilotCallout, showCopilotCallout } from './callout';
import { removeNarrativeOverlay, showNarrativeOverlay } from './overlay';
import { narrativeDurationMs, narrativePauseMs } from './preferences';
import { aiFocusDevLog } from './devLog';

let activeAbort: AbortController | null = null;
let running = false;

const INTERRUPT_IGNORE_SELECTORS = [
  '.copilot-panel-enter',
  'aside[aria-label="Copiloto Navegador"]',
  '.copilot-fab-pulse',
  '.copilot-narrative-overlay',
  '.copilot-callout',
  '.ai-focus-dim',
  '.ai-focus-ring',
  '.ai-focus-spotlight',
].join(', ');

const INCOME_FALLBACK_ID = 'copilot-income-summary';

export function isNarrativeRunning(): boolean {
  return running;
}

/** Cancela cualquier secuencia narrativa activa y limpia UI. */
export function cancelNarrativeNavigation(): void {
  activeAbort?.abort();
  activeAbort = null;
  running = false;
  aiFocusDevLog('[ai-focus:cleanup]', { reason: 'cancel' });
  cancelAIFocusMode();
  removeCopilotCallout();
  removeNarrativeOverlay();
}

function tryResolveTarget(step: NarrativeStep, opts: NarrativeRunOptions): HTMLElement | null {
  const el = opts.resolveTarget(step);
  if (el) return el;

  const target = step.target.trim();
  if (target.startsWith('#') || target.startsWith('.') || target.startsWith('[')) {
    const q = document.querySelector(target) as HTMLElement | null;
    if (q) return q;
  } else if (target) {
    const byId = document.getElementById(target.replace(/^#/, ''));
    if (byId) return byId;
  }

  if (
    target === INCOME_FALLBACK_ID
    || target === `#${INCOME_FALLBACK_ID}`
    || step.applyMonth != null
  ) {
    return document.getElementById(INCOME_FALLBACK_ID);
  }

  return null;
}

async function resolveTargetWithRetry(
  step: NarrativeStep,
  opts: NarrativeRunOptions,
  signal: AbortSignal,
): Promise<HTMLElement | null> {
  const delays = [0, 320, 680, 1200];

  for (const delay of delays) {
    if (signal.aborted) return null;
    if (delay > 0) await waitMs(delay, signal);

    const el = tryResolveTarget(step, opts);
    if (el) {
      aiFocusDevLog('[ai-focus:target-found]', {
        target: step.target,
        id: el.id || null,
        delayMs: delay,
      });
      return el;
    }
  }

  const fallback = document.getElementById(INCOME_FALLBACK_ID);
  if (fallback) {
    aiFocusDevLog('[ai-focus:target-missing]', {
      target: step.target,
      fallback: INCOME_FALLBACK_ID,
    });
    return fallback;
  }

  aiFocusDevLog('[ai-focus:target-missing]', {
    target: step.target,
    fallback: null,
  });
  return null;
}

async function runStep(
  step: NarrativeStep,
  opts: NarrativeRunOptions,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;

  const pause = step.pauseBeforeMs ?? 0;
  if (pause > 0) {
    await waitMs(narrativePauseMs(pause), signal);
  }

  opts.onApplyFilters?.(step);
  if (step.applyMonth != null || step.applyYear != null) {
    await waitMs(320, signal);
  }

  const el = await resolveTargetWithRetry(step, opts, signal);
  if (!el || signal.aborted) return;

  if (step.scroll !== false) {
    await cinematicScrollToElement(el, signal);
    await waitMs(220, signal);
  }

  const kind = step.highlightType ?? 'neutral';
  const duration = narrativeDurationMs(step.duration ?? 4500);

  applyNarrativeHighlight(el, kind, duration);
  showCopilotCallout(el, step.label, step.description);

  await waitMs(duration, signal);

  if (signal.aborted) return;

  await Promise.all([fadeOutCopilotCallout(), deactivateAIFocusMode(520)]);
  aiFocusDevLog('[ai-focus:cleanup]', { reason: 'step-complete' });
}

/** Ejecuta una secuencia narrativa paso a paso. */
export async function runNarrativeSequence(
  sequence: NarrativeSequence,
  opts: NarrativeRunOptions,
): Promise<void> {
  cancelNarrativeNavigation();

  if (!sequence.steps.length) return;

  activeAbort = new AbortController();
  const signal = activeAbort.signal;
  running = true;

  aiFocusDevLog('[ai-focus:start]', {
    path: sequence.path,
    steps: sequence.steps.length,
    stepTargets: sequence.steps.map((s) => s.target),
  });

  const hideOverlay = sequence.showOverlay !== false ? showNarrativeOverlay() : () => undefined;

  if (opts.initialDelayMs && opts.initialDelayMs > 0) {
    await waitMs(opts.initialDelayMs, signal);
  }

  try {
    for (let i = 0; i < sequence.steps.length; i += 1) {
      if (signal.aborted) break;
      await runStep(sequence.steps[i], opts, signal);
      if (i < sequence.steps.length - 1) {
        await waitMs(narrativePauseMs(600), signal);
      }
    }
  } finally {
    hideOverlay();
    running = false;
    if (activeAbort?.signal === signal) activeAbort = null;
    cancelAIFocusMode();
    removeCopilotCallout();
  }
}

/** Escucha navegación manual para cancelar narrativa. */
export function installNarrativeInterruptHandlers(): () => void {
  const onPop = () => cancelNarrativeNavigation();
  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(INTERRUPT_IGNORE_SELECTORS)) return;
    if (target.closest('a[href], button, [role="button"]')) {
      cancelNarrativeNavigation();
    }
  };

  window.addEventListener('popstate', onPop);
  document.addEventListener('click', onClick, true);

  return () => {
    window.removeEventListener('popstate', onPop);
    document.removeEventListener('click', onClick, true);
  };
}
