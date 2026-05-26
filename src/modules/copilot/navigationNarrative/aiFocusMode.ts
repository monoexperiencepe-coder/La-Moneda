/**
 * AI Focus Mode — guía visual cinematográfica al llegar a un dato.
 * Capas fijas en body para aislamiento sobre el dim (stacking context safe).
 */
import type { NarrativeHighlightKind } from './types';
import { narrativeDurationMs, prefersReducedMotion } from './preferences';
import { aiFocusDevLog, isAiFocusDebugEnabled } from './devLog';

const BODY_ACTIVE = 'ai-focus-mode-active';
const SCRIM_CLASS = 'ai-focus-dim';
const SPOTLIGHT_CLASS = 'ai-focus-spotlight';
const RING_CLASS = 'ai-focus-ring';
const FRAME_CLASS = 'ai-focus-frame';
const EXPAND_CLASS = 'ai-focus-expand-ring';
const FALLBACK_CLASS = 'ai-focus-fallback-overlay';
const DEBUG_CLASS = 'ai-focus-debug-banner';
const INCOME_FALLBACK_ID = 'copilot-income-summary';

const Z_DIM = '99980';
const Z_FRAME = '99990';
const Z_CALLOUT = '99995';

const TYPE_MODIFIER: Record<NarrativeHighlightKind, string> = {
  income: `${SPOTLIGHT_CLASS}--income`,
  success: `${SPOTLIGHT_CLASS}--success`,
  warning: `${SPOTLIGHT_CLASS}--warning`,
  neutral: `${SPOTLIGHT_CLASS}--neutral`,
  anomaly: `${SPOTLIGHT_CLASS}--anomaly`,
};

const FRAME_MODIFIER: Record<NarrativeHighlightKind, string> = {
  income: `${FRAME_CLASS}--income`,
  success: `${FRAME_CLASS}--success`,
  warning: `${FRAME_CLASS}--warning`,
  neutral: `${FRAME_CLASS}--neutral`,
  anomaly: `${FRAME_CLASS}--anomaly`,
};

let activeTarget: HTMLElement | null = null;
let activeKind: NarrativeHighlightKind = 'neutral';
let activeRing: HTMLElement | null = null;
let activeFrame: HTMLElement | null = null;
let activeExpandRing: HTMLElement | null = null;
let activeFallback: HTMLElement | null = null;
let activeDebug: HTMLElement | null = null;
let activePositionTouched = false;
let afterglowTimer: number | null = null;
let syncFrameRaf: number | null = null;

const AFTERGLOW_MS = 800;
const NARRATIVE_HIGHLIGHT_CLASSES = [
  'copilot-narrative-highlight',
  'copilot-narrative-highlight--income',
  'copilot-narrative-highlight--success',
  'copilot-narrative-highlight--warning',
  'copilot-narrative-highlight--anomaly',
  'copilot-narrative-highlight--neutral',
  'copilot-narrative-highlight--fading',
] as const;

const AFTERGLOW_CLASSES = [
  'ai-focus-afterglow',
  'ai-focus-afterglow--income',
  'ai-focus-afterglow--success',
  'ai-focus-afterglow--warning',
  'ai-focus-afterglow--anomaly',
  'ai-focus-afterglow--neutral',
] as const;

function framePad(): number {
  return window.innerWidth < 640 ? 10 : 16;
}

function isRectValid(rect: DOMRect): boolean {
  return rect.width > 8 && rect.height > 8;
}

function isRectInViewport(rect: DOMRect): boolean {
  return (
    rect.bottom > 0
    && rect.right > 0
    && rect.top < window.innerHeight
    && rect.left < window.innerWidth
  );
}

function logRect(el: HTMLElement, label: string): DOMRect {
  const rect = el.getBoundingClientRect();
  aiFocusDevLog('[ai-focus:rect]', {
    label,
    id: el.id || null,
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    visible: isRectValid(rect) && isRectInViewport(rect),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
  return rect;
}

function logDomCreated(): void {
  const dim = document.querySelector(`.${SCRIM_CLASS}`) as HTMLElement | null;
  aiFocusDevLog('[ai-focus:dom-created]', {
    dimExists: Boolean(dim),
    frameExists: Boolean(activeFrame),
    ringExists: Boolean(activeRing),
    calloutExists: Boolean(document.querySelector('.copilot-callout')),
    fallbackExists: Boolean(activeFallback),
    zIndex: Z_FRAME,
  });
  aiFocusDevLog('[ai-focus:styles]', {
    frameOpacity: activeFrame ? getComputedStyle(activeFrame).opacity : null,
    dimOpacity: dim ? getComputedStyle(dim).opacity : null,
    frameDisplay: activeFrame ? getComputedStyle(activeFrame).display : null,
    calloutDisplay: (document.querySelector('.copilot-callout') as HTMLElement | null)
      ? getComputedStyle(document.querySelector('.copilot-callout') as HTMLElement).display
      : null,
  });
}

function applyFixedLayerBase(el: HTMLElement, zIndex: string): void {
  el.style.position = 'fixed';
  el.style.pointerEvents = 'none';
  el.style.display = 'block';
  el.style.zIndex = zIndex;
}

function applyFixedRect(node: HTMLElement, rect: DOMRect, pad: number): void {
  node.style.top = `${Math.max(0, rect.top - pad)}px`;
  node.style.left = `${Math.max(0, rect.left - pad)}px`;
  node.style.width = `${Math.max(0, rect.width + pad * 2)}px`;
  node.style.height = `${Math.max(0, rect.height + pad * 2)}px`;
}

function syncVisualLayers(): void {
  const el = activeTarget;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (!isRectValid(rect)) return;
  const pad = framePad();
  const ringPad = pad + 4;
  if (activeFrame) applyFixedRect(activeFrame, rect, pad);
  if (activeRing) applyFixedRect(activeRing, rect, ringPad);
  if (activeExpandRing) applyFixedRect(activeExpandRing, rect, ringPad);
}

function startFrameSync(): void {
  const tick = () => {
    syncVisualLayers();
    syncFrameRaf = requestAnimationFrame(tick);
  };
  syncFrameRaf = requestAnimationFrame(tick);
}

function stopFrameSync(): void {
  if (syncFrameRaf != null) {
    cancelAnimationFrame(syncFrameRaf);
    syncFrameRaf = null;
  }
}

function removeFocusRing(): void {
  activeRing?.remove();
  activeRing = null;
}

function removeFocusFrame(): void {
  activeFrame?.remove();
  activeFrame = null;
}

function removeExpandRing(): void {
  activeExpandRing?.remove();
  activeExpandRing = null;
}

function removeFallbackOverlay(): void {
  activeFallback?.remove();
  activeFallback = null;
}

function removeDebugBanner(): void {
  activeDebug?.remove();
  activeDebug = null;
}

function showDebugBanner(): void {
  if (!isAiFocusDebugEnabled()) return;
  removeDebugBanner();
  const banner = document.createElement('div');
  banner.className = DEBUG_CLASS;
  banner.textContent = 'AI FOCUS ACTIVE';
  banner.setAttribute('aria-hidden', 'true');
  document.body.appendChild(banner);
  activeDebug = banner;
}

function showFallbackOverlay(title: string, subtitle?: string): void {
  removeFallbackOverlay();
  const overlay = document.createElement('div');
  overlay.className = FALLBACK_CLASS;
  overlay.setAttribute('role', 'status');
  overlay.innerHTML = `
    <div class="ai-focus-fallback-card">
      <p class="ai-focus-fallback-title">✨ ${title}</p>
      ${subtitle?.trim() ? `<p class="ai-focus-fallback-subtitle">${subtitle.trim()}</p>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  activeFallback = overlay;
}

function isContainerTooLarge(rect: DOMRect): boolean {
  return rect.width > 700 || rect.height > 400;
}

function narrowLargeIncomeTarget(el: HTMLElement): HTMLElement {
  const rect = el.getBoundingClientRect();
  if (!isContainerTooLarge(rect)) return el;

  const month = el.getAttribute('data-copilot-month');
  const scoped = month
    ? el.querySelector<HTMLElement>(`[data-copilot-target="income-month-value"][data-copilot-month="${month}"]`)
      ?? el.querySelector<HTMLElement>(`[data-copilot-target="income-month"][data-copilot-month="${month}"]`)
    : null;
  const child =
    scoped
    ?? el.querySelector<HTMLElement>('[data-copilot-target="income-month-value"]')
    ?? el.querySelector<HTMLElement>('[data-copilot-target="income-month"]')
    ?? el.querySelector<HTMLElement>('[data-copilot-month]');

  if (child) {
    const childRect = child.getBoundingClientRect();
    if (isRectValid(childRect) && !isContainerTooLarge(childRect)) {
      aiFocusDevLog('[ai-focus:target-narrowed]', {
        from: el.id || el.getAttribute('data-copilot-target'),
        to: child.getAttribute('data-copilot-month'),
        width: Math.round(childRect.width),
        height: Math.round(childRect.height),
      });
      return child;
    }
  }

  return el;
}

function resolveFocusTarget(el: HTMLElement): HTMLElement {
  let target = narrowLargeIncomeTarget(el);
  let rect = logRect(target, 'initial');
  if (isRectValid(rect) && !isContainerTooLarge(rect)) return target;

  const fallback = document.getElementById(INCOME_FALLBACK_ID);
  if (fallback && fallback !== target) {
    aiFocusDevLog('[ai-focus:target-missing]', { reason: 'invalid-rect', fallback: INCOME_FALLBACK_ID });
    logRect(fallback, 'fallback');
    return narrowLargeIncomeTarget(fallback);
  }

  const parent = target.parentElement;
  if (parent && parent !== document.body) {
    const parentRect = parent.getBoundingClientRect();
    if (isRectValid(parentRect) && !isContainerTooLarge(parentRect)) {
      aiFocusDevLog('[ai-focus:target-missing]', { reason: 'using-parent', id: parent.id || null });
      return parent;
    }
  }

  return target;
}

async function ensureTargetVisible(el: HTMLElement): Promise<HTMLElement> {
  let target = resolveFocusTarget(el);

  if (!isRectInViewport(target.getBoundingClientRect()) || !isRectValid(target.getBoundingClientRect())) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    await new Promise((r) => window.setTimeout(r, 420));
    target = resolveFocusTarget(target);
  }

  return target;
}

function positionFocusLayers(el: HTMLElement, kind: NarrativeHighlightKind): void {
  removeFocusRing();
  removeFocusFrame();
  removeExpandRing();

  const rect = el.getBoundingClientRect();
  const pad = framePad();
  const ringPad = pad + 4;

  const frame = document.createElement('div');
  frame.className = `${FRAME_CLASS} ${FRAME_MODIFIER[kind] ?? FRAME_MODIFIER.neutral}`;
  frame.setAttribute('aria-hidden', 'true');
  applyFixedLayerBase(frame, Z_FRAME);
  applyFixedRect(frame, rect, pad);
  document.body.appendChild(frame);
  activeFrame = frame;

  const expand = document.createElement('div');
  expand.className = EXPAND_CLASS;
  expand.setAttribute('aria-hidden', 'true');
  applyFixedLayerBase(expand, '99988');
  applyFixedRect(expand, rect, ringPad);
  document.body.appendChild(expand);
  activeExpandRing = expand;

  const ring = document.createElement('div');
  ring.className = `${RING_CLASS} ${RING_CLASS}--${kind === 'income' || kind === 'neutral' ? 'income' : kind}`;
  ring.setAttribute('aria-hidden', 'true');
  applyFixedLayerBase(ring, Z_FRAME);
  applyFixedRect(ring, rect, ringPad);
  document.body.appendChild(ring);
  activeRing = ring;

  requestAnimationFrame(() => {
    frame.classList.add(`${FRAME_CLASS}--visible`);
    frame.style.opacity = '1';
    expand.classList.add(`${EXPAND_CLASS}--visible`);
    expand.style.opacity = '1';
    ring.classList.add(`${RING_CLASS}--visible`);
    ring.style.opacity = '1';
    logDomCreated();
  });
}

function showEnvironmentDim(): void {
  removeEnvironmentDim();
  const scrim = document.createElement('div');
  scrim.className = SCRIM_CLASS;
  scrim.setAttribute('aria-hidden', 'true');
  applyFixedLayerBase(scrim, Z_DIM);
  scrim.style.inset = '0';
  document.body.appendChild(scrim);
  requestAnimationFrame(() => {
    scrim.classList.add(`${SCRIM_CLASS}--visible`);
    scrim.style.opacity = '1';
  });
}

function removeEnvironmentDim(): void {
  document.querySelectorAll(`.${SCRIM_CLASS}`).forEach((el) => el.remove());
}

function removeDecorationsFromTarget(el: HTMLElement): void {
  el.querySelectorAll(
    '.ai-focus-halo, .ai-focus-pulse-dot, .ai-focus-shimmer, .copilot-narrative-halo, .copilot-narrative-ping',
  ).forEach((node) => node.remove());
}

function resetTargetInlineStyles(el: HTMLElement): void {
  const props = [
    'z-index',
    'transform',
    'filter',
    'outline',
    'outline-offset',
    'box-shadow',
    'animation',
    'opacity',
    'background-color',
    'isolation',
  ] as const;
  for (const prop of props) el.style.removeProperty(prop);
  if (activePositionTouched) {
    el.style.removeProperty('position');
    activePositionTouched = false;
  }
}

function resetTargetClasses(el: HTMLElement): void {
  el.classList.remove(
    SPOTLIGHT_CLASS,
    ...Object.values(TYPE_MODIFIER),
    `${SPOTLIGHT_CLASS}--fading`,
    `${SPOTLIGHT_CLASS}--exiting`,
    `${SPOTLIGHT_CLASS}--enter`,
    ...NARRATIVE_HIGHLIGHT_CLASSES,
    ...AFTERGLOW_CLASSES,
  );
}

function clearSpotlightClasses(el: HTMLElement): void {
  removeDecorationsFromTarget(el);
  resetTargetClasses(el);
  resetTargetInlineStyles(el);
}

function purgeAllFocusArtifacts(): void {
  const selectors = [
    `.${SCRIM_CLASS}`,
    `.${RING_CLASS}`,
    `.${FRAME_CLASS}`,
    `.${EXPAND_CLASS}`,
    `.${FALLBACK_CLASS}`,
    `.${DEBUG_CLASS}`,
    '.copilot-callout',
    '.copilot-callout-arrow',
  ];
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((node) => node.remove());
  }
  activeRing = null;
  activeFrame = null;
  activeExpandRing = null;
  activeFallback = null;
  activeDebug = null;
}

function cancelAfterglow(): void {
  if (afterglowTimer != null) {
    window.clearTimeout(afterglowTimer);
    afterglowTimer = null;
  }
}

function afterglowVariant(kind: NarrativeHighlightKind): string {
  return kind === 'income' || kind === 'neutral' ? 'income' : kind;
}

function scheduleSubtleAfterglow(el: HTMLElement, kind: NarrativeHighlightKind): void {
  cancelAfterglow();
  if (prefersReducedMotion()) return;

  const variant = afterglowVariant(kind);
  resetTargetClasses(el);
  resetTargetInlineStyles(el);
  el.classList.add('ai-focus-afterglow', `ai-focus-afterglow--${variant}`);

  afterglowTimer = window.setTimeout(() => {
    el.classList.remove(...AFTERGLOW_CLASSES);
    resetTargetInlineStyles(el);
    afterglowTimer = null;
    aiFocusDevLog('[ai-focus:cleanup]', { reason: 'afterglow-complete' });
  }, AFTERGLOW_MS);
}

function removeAllVisualLayers(): void {
  stopFrameSync();
  purgeAllFocusArtifacts();
  removeEnvironmentDim();
}

/** Prepara target (scroll + rect) y activa focus. */
export async function prepareAndActivateAIFocusMode(
  el: HTMLElement,
  kind: NarrativeHighlightKind = 'neutral',
  callout?: { title?: string; subtitle?: string },
): Promise<HTMLElement> {
  const target = await ensureTargetVisible(el);
  const rect = logRect(target, 'pre-activate');

  activateAIFocusMode(target, kind);

  if (!isRectValid(rect)) {
    showFallbackOverlay(
      callout?.title ?? 'Aquí está el dato',
      callout?.subtitle,
    );
  }

  return target;
}

/** Activa AI Focus Mode sobre un elemento. */
export function activateAIFocusMode(el: HTMLElement, kind: NarrativeHighlightKind = 'neutral'): void {
  cancelAIFocusMode();

  activeKind = kind;
  document.body.classList.add(BODY_ACTIVE);
  showEnvironmentDim();
  showDebugBanner();

  const pos = window.getComputedStyle(el).position;
  activePositionTouched = pos === 'static';
  if (activePositionTouched) el.style.position = 'relative';
  el.style.zIndex = Z_FRAME;

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

  const shimmer = document.createElement('span');
  shimmer.className = 'ai-focus-shimmer';
  shimmer.setAttribute('aria-hidden', 'true');
  el.appendChild(shimmer);

  const dot = document.createElement('span');
  dot.className = 'ai-focus-pulse-dot';
  dot.setAttribute('aria-hidden', 'true');
  el.appendChild(dot);

  activeTarget = el;
  positionFocusLayers(el, kind);
  if (!prefersReducedMotion()) startFrameSync();

  aiFocusDevLog('[ai-focus:activated]', {
    id: el.id || null,
    kind,
    label: el.getAttribute('data-copilot-month') ?? undefined,
  });
}

/** Restaura la UI con transición suave y micro-highlight opcional. */
export function deactivateAIFocusMode(fadeMs = 480): Promise<void> {
  const el = activeTarget;
  const kind = activeKind;
  const scrim = document.querySelector(`.${SCRIM_CLASS}`) as HTMLElement | null;
  const ring = activeRing;
  const frame = activeFrame;
  const expand = activeExpandRing;

  stopFrameSync();
  document.body.classList.remove(BODY_ACTIVE);
  activeTarget = null;

  if (!el && !scrim) {
    removeAllVisualLayers();
    return Promise.resolve();
  }

  if (prefersReducedMotion()) {
    if (el) clearSpotlightClasses(el);
    removeAllVisualLayers();
    return Promise.resolve();
  }

  if (el) {
    removeDecorationsFromTarget(el);
    el.classList.remove(`${SPOTLIGHT_CLASS}--enter`, ...Object.values(TYPE_MODIFIER));
    el.classList.add(`${SPOTLIGHT_CLASS}--exiting`);
    el.style.setProperty('animation', 'none', 'important');
    el.style.setProperty('outline', 'none', 'important');
    el.style.setProperty('box-shadow', 'none', 'important');
  }

  scrim?.classList.remove(`${SCRIM_CLASS}--visible`);
  scrim?.classList.add(`${SCRIM_CLASS}--exiting`);
  ring?.classList.remove(`${RING_CLASS}--visible`);
  ring?.classList.add(`${RING_CLASS}--exiting`);
  frame?.classList.remove(`${FRAME_CLASS}--visible`);
  frame?.classList.add(`${FRAME_CLASS}--exiting`);
  expand?.classList.remove(`${EXPAND_CLASS}--visible`);
  expand?.classList.add(`${EXPAND_CLASS}--exiting`);
  activeFallback?.classList.add(`${FALLBACK_CLASS}--exiting`);

  const exitMs = narrativeDurationMs(fadeMs);

  return new Promise((resolve) => {
    window.setTimeout(() => {
      if (el) {
        clearSpotlightClasses(el);
        scheduleSubtleAfterglow(el, kind);
      }
      removeAllVisualLayers();
      aiFocusDevLog('[ai-focus:cleanup]', { reason: 'deactivate-complete' });
      resolve();
    }, exitMs);
  });
}

/** Limpieza inmediata (cancelación). */
export function cancelAIFocusMode(): void {
  aiFocusDevLog('[ai-focus:cleanup]', { reason: 'cancel-immediate' });
  cancelAfterglow();
  document.body.classList.remove(BODY_ACTIVE);
  if (activeTarget) clearSpotlightClasses(activeTarget);
  activeTarget = null;
  removeAllVisualLayers();
}

/** Limpia capas flotantes sin tocar afterglow del target (fin de secuencia narrativa). */
export function finalizeNarrativeFocusLayers(): void {
  purgeAllFocusArtifacts();
  document.body.classList.remove(BODY_ACTIVE);
  stopFrameSync();
}

export { showEnvironmentDim, removeEnvironmentDim, showFallbackOverlay, Z_CALLOUT };
