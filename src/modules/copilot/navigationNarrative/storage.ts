import type { NarrativeSequence, NarrativeStep } from './types';
import type { NarrativeRunOptions } from './types';

const STORAGE_KEY = 'copilot-narrative-pending';

type StoredNarrative = NarrativeSequence & { createdAt: number };

function normalizePath(path: string): string {
  return path.split('?')[0].trim();
}

export function queueNarrativeNavigation(sequence: Omit<NarrativeSequence, 'id'> & { id?: string }): string {
  const id = sequence.id ?? `nar-${Date.now()}`;
  const payload: StoredNarrative = {
    id,
    path: normalizePath(sequence.path),
    steps: sequence.steps,
    showOverlay: sequence.showOverlay ?? true,
    createdAt: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
  return id;
}

export function peekNarrativeForPath(pathname: string): NarrativeSequence | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredNarrative;
    if (normalizePath(parsed.path) !== normalizePath(pathname)) return null;
    if (Date.now() - parsed.createdAt > 120_000) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      id: parsed.id,
      path: parsed.path,
      steps: parsed.steps,
      showOverlay: parsed.showOverlay,
    };
  } catch {
    return null;
  }
}

export function consumeNarrativeForPath(pathname: string): NarrativeSequence | null {
  const peek = peekNarrativeForPath(pathname);
  if (!peek) return null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return peek;
}

export function clearPendingNarrative(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function resolveStepTarget(step: NarrativeStep, resolver?: (s: NarrativeStep) => HTMLElement | null): HTMLElement | null {
  if (resolver) {
    const resolved = resolver(step);
    if (resolved) return resolved;
  }
  const t = step.target.trim();
  if (!t) return null;
  if (t.startsWith('#') || t.startsWith('.') || t.startsWith('[')) {
    return document.querySelector(t) as HTMLElement | null;
  }
  return document.getElementById(t);
}
