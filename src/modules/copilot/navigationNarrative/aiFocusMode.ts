/**
 * AI Focus Mode — guía visual cinematográfica al llegar a un dato.
 * Environment dim + spotlight elevado + anillo + respiración suave.
 */
import type { NarrativeHighlightKind } from './types';
import { narrativeDurationMs, prefersReducedMotion } from './preferences';
import { aiFocusDevLog } from './devLog';

const BODY_ACTIVE = 'ai-focus-mode-active';
const SCRIM_CLASS = 'ai-focus-dim';
const SPOTLIGHT_CLASS = 'ai-focus-spotlight';
const RING_CLASS = 'ai-focus-ring';

const TYPE_MODIFIER: Record<NarrativeHighlightKind, string> = {
  income: `${SPOTLIGHT_CLASS}--income`,
  success: `${SPOTLIGHT_CLASS}--success`,
  warning: `${SPOTLIGHT_CLASS}--warning`,
  neutral: `${SPOTLIGHT_CLASS}--neutral`,
  anomaly: `${SPOTLIGHT_CLASS}--anomaly`,
};

let activeTarget: HTMLElement | null = null;
let activeRing: HTMLElement | null = null;

function positionFocusRing(el: HTMLElement): void {
  removeFocusRing();
  const rect = el.getBoundingClientRect();
  const pad = 10;
  const ring = document.createElement('div');
  ring.className = RING_CLASS;
  ring.setAttribute('aria-hidden', 'true');
  ring.style.top = `${rect.top - pad}px`;
  ring.style.left = `${rect.left - pad}px`;
  ring.style.width = `${rect.width + pad * 2}px`;
  ring.style.height = `${rect.height + pad * 2}px`;
  document.body.appendChild(ring);
  activeRing = ring;
  requestAnimationFrame(() => ring.classList.add(`${RING_CLASS}--visible`));
}

function removeFocusRing(): void {
  activeRing?.remove();
  activeRing = null;
}

function showEnvironmentDim(): void {
  removeEnvironmentDim();
  const scrim = document.createElement('div');
  scrim.className = SCRIM_CLASS;
  scrim.setAttribute('aria-hidden', 'true');
  document.body.appendChild(scrim);
  requestAnimationFrame(() => scrim.classList.add(`${SCRIM_CLASS}--visible`));
}

function removeEnvironmentDim(): void {
  document.querySelectorAll(`.${SCRIM_CLASS}`).forEach((el) => el.remove());
}

function clearSpotlightClasses(el: HTMLElement): void {
  el.classList.remove(
    SPOTLIGHT_CLASS,
    ...Object.values(TYPE_MODIFIER),
    `${SPOTLIGHT_CLASS}--fading`,
    `${SPOTLIGHT_CLASS}--enter`,
  );
  el.style.zIndex = '';
  el.style.position = '';
  el.querySelectorAll('.ai-focus-halo, .ai-focus-pulse-dot').forEach((n) => n.remove());
}

/** Activa AI Focus Mode sobre un elemento. */
export function activateAIFocusMode(el: HTMLElement, kind: NarrativeHighlightKind = 'neutral'): void {
  cancelAIFocusMode();

  document.body.classList.add(BODY_ACTIVE);
  showEnvironmentDim();

  const pos = window.getComputedStyle(el).position;
  if (pos === 'static') el.style.position = 'relative';
  el.style.zIndex = '10001';

  clearSpotlightClasses(el);
  void el.offsetWidth;

  const modifier = TYPE_MODIFIER[kind] ?? TYPE_MODIFIER.neutral;
  el.classList.add(SPOTLIGHT_CLASS, modifier);
  if (!prefersReducedMotion()) {
    el.classList.add(`${SPOTLIGHT_CLASS}--enter`);
  }

  const halo = document.createElement('span');
  halo.className = 'ai-focus-halo';
  halo.setAttribute('aria-hidden', 'true');
  el.appendChild(halo);

  const dot = document.createElement('span');
  dot.className = 'ai-focus-pulse-dot';
  dot.setAttribute('aria-hidden', 'true');
  el.appendChild(dot);

  activeTarget = el;
  positionFocusRing(el);

  aiFocusDevLog('[ai-focus:activated]', {
    id: el.id || null,
    kind,
    label: el.getAttribute('data-copilot-month') ?? undefined,
  });
}

/** Restaura la UI con transición suave. */
export function deactivateAIFocusMode(fadeMs = 480): Promise<void> {
  const el = activeTarget;
  const scrim = document.querySelector(`.${SCRIM_CLASS}`) as HTMLElement | null;
  const ring = activeRing;

  document.body.classList.remove(BODY_ACTIVE);

  if (!el && !scrim) {
    removeFocusRing();
    removeEnvironmentDim();
    return Promise.resolve();
  }

  if (prefersReducedMotion()) {
    if (el) clearSpotlightClasses(el);
    removeFocusRing();
    removeEnvironmentDim();
    activeTarget = null;
    return Promise.resolve();
  }

  scrim?.classList.remove(`${SCRIM_CLASS}--visible`);
  scrim?.classList.add(`${SCRIM_CLASS}--exiting`);
  ring?.classList.remove(`${RING_CLASS}--visible`);
  ring?.classList.add(`${RING_CLASS}--exiting`);
  el?.classList.add(`${SPOTLIGHT_CLASS}--fading`);

  return new Promise((resolve) => {
    window.setTimeout(() => {
      if (el) clearSpotlightClasses(el);
      removeFocusRing();
      removeEnvironmentDim();
      activeTarget = null;
      resolve();
    }, narrativeDurationMs(fadeMs));
  });
}

/** Limpieza inmediata (cancelación). */
export function cancelAIFocusMode(): void {
  aiFocusDevLog('[ai-focus:cleanup]', { reason: 'cancel-immediate' });
  document.body.classList.remove(BODY_ACTIVE);
  if (activeTarget) clearSpotlightClasses(activeTarget);
  activeTarget = null;
  removeFocusRing();
  removeEnvironmentDim();
}

export { showEnvironmentDim, removeEnvironmentDim };
