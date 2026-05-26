import type { NarrativeSequence, NarrativeRunOptions, NarrativeStep } from './types';
import { cinematicScrollToElement } from './scroll';
import { cancelAIFocusMode, deactivateAIFocusMode, finalizeNarrativeFocusLayers } from './aiFocusMode';
import { applyNarrativeHighlight, waitMs } from './highlight';
import { fadeOutCopilotCallout, removeCopilotCallout, showCopilotCallout } from './callout';
import { removeNarrativeOverlay, showNarrativeOverlay } from './overlay';
import { narrativeDurationMs, narrativePauseMs } from './preferences';
import { aiFocusDevLog, narrativeDevLog } from './devLog';
import {
  buildIncomeMonthCalloutDescription,
  resolveIncomeMonthFocusTarget,
} from './resolveIncomeMonthTarget';
import { isNarrativeNavigationGraceActive } from './storage';

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
  '[data-copilot-suggested-action]',
].join(', ');

const INCOME_FALLBACK_ID = 'copilot-income-summary';

export function isNarrativeRunning(): boolean {
  return running;
}

function stopActiveNarrativeRun(): void {
  activeAbort?.abort();
  activeAbort = null;
  running = false;
  cancelAIFocusMode();
  removeCopilotCallout();
  removeNarrativeOverlay();
}

/** Cancela narrativa activa en pantalla (no borra sessionStorage pendiente). */
export function cancelNarrativeNavigation(reason = 'user'): void {
  narrativeDevLog('[copilot:narrative:cancel]', { reason, wasRunning: running });
  aiFocusDevLog('[ai-focus:cleanup]', { reason: 'cancel' });
  stopActiveNarrativeRun();
}

function tryResolveTarget(step: NarrativeStep, opts: NarrativeRunOptions): HTMLElement | null {
  const el = opts.resolveTarget(step);
  if (el) {
    const rect = el.getBoundingClientRect();
    const tooLarge = rect.width > 700 || rect.height > 400;
    if (!tooLarge || step.applyMonth == null) return el;
  }

  if (step.applyMonth != null || step.target === 'income-month') {
    const resolved = resolveIncomeMonthFocusTarget(step.applyMonth ?? '', step.applyYear);
    if (resolved) return resolved.el;
  }

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
    || step.target === 'income-month'
  ) {
    if (step.applyMonth != null) {
      const resolved = resolveIncomeMonthFocusTarget(step.applyMonth, step.applyYear);
      if (resolved) return resolved.el;
    }
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
    await waitMs(step.applyMonth != null ? 480 : 320, signal);
  }

  const el = await resolveTargetWithRetry(step, opts, signal);
  if (!el || signal.aborted) return;

  if (step.scroll !== false) {
    await cinematicScrollToElement(el, signal);
    await waitMs(450, signal);
  }

  const kind = step.highlightType ?? 'neutral';
  const duration = narrativeDurationMs(step.duration ?? 4500);

  let calloutSubtitle = step.description;
  if (step.applyMonth != null || step.target === 'income-month') {
    const amountText =
      el.getAttribute('data-copilot-amount')
      ?? el.querySelector('[data-copilot-target="income-month-value"]')?.getAttribute('data-copilot-amount')
      ?? resolveIncomeMonthFocusTarget(step.applyMonth ?? '', step.applyYear)?.amountText;
    calloutSubtitle = buildIncomeMonthCalloutDescription(step.description, amountText);
  }

  const focused = await applyNarrativeHighlight(el, kind, duration, {
    title: step.label,
    subtitle: calloutSubtitle,
  });
  showCopilotCallout(focused, step.label, calloutSubtitle);

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
  stopActiveNarrativeRun();

  if (!sequence.steps.length) return;

  activeAbort = new AbortController();
  const signal = activeAbort.signal;
  running = true;

  narrativeDevLog('[copilot:narrative:run]', {
    id: sequence.id,
    path: sequence.path,
    steps: sequence.steps.length,
  });

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
    finalizeNarrativeFocusLayers();
    removeCopilotCallout();
  }
}

/** Escucha navegación manual para cancelar narrativa activa. */
export function installNarrativeInterruptHandlers(): () => void {
  const onPop = () => cancelNarrativeNavigation('popstate');
  const onClick = (e: MouseEvent) => {
    if (isNarrativeNavigationGraceActive()) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(INTERRUPT_IGNORE_SELECTORS)) return;
    if (target.closest('a[href], button, [role="button"]')) {
      cancelNarrativeNavigation('click');
    }
  };

  window.addEventListener('popstate', onPop);
  document.addEventListener('click', onClick, true);

  return () => {
    window.removeEventListener('popstate', onPop);
    document.removeEventListener('click', onClick, true);
  };
}
