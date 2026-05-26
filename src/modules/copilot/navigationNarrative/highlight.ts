import type { NarrativeHighlightKind } from './types';
import { narrativeDurationMs } from './preferences';
import {
  activateAIFocusMode,
  cancelAIFocusMode,
  deactivateAIFocusMode,
} from './aiFocusMode';

/** @deprecated Use activateAIFocusMode — mantiene compatibilidad con narrative engine. */
export function applyNarrativeHighlight(
  el: HTMLElement,
  kind: NarrativeHighlightKind = 'neutral',
  _durationMs = 4000,
): void {
  activateAIFocusMode(el, kind);
}

export function clearNarrativeHighlight(): void {
  cancelAIFocusMode();
}

export function fadeOutNarrativeHighlight(durationMs = 480): Promise<void> {
  return deactivateAIFocusMode(durationMs);
}

export { activateAIFocusMode, deactivateAIFocusMode, cancelAIFocusMode };

export function waitMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  const wait = narrativeDurationMs(ms);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(), wait);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
