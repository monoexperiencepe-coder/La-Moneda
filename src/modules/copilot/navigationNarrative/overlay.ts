import { prefersReducedMotion } from './preferences';
import { isAiFocusDebugEnabled } from './devLog';

const OVERLAY_CLASS = 'copilot-narrative-overlay';
const OVERLAY_VISIBLE = 'copilot-narrative-overlay-visible';

export function showNarrativeOverlay(message = 'Copiloto IA guiándote…'): () => void {
  if (!isAiFocusDebugEnabled()) {
    return () => undefined;
  }
  removeNarrativeOverlay();

  const el = document.createElement('div');
  el.className = OVERLAY_CLASS;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');

  const inner = document.createElement('div');
  inner.className = 'copilot-narrative-overlay-inner';

  const dot = document.createElement('span');
  dot.className = 'copilot-narrative-overlay-dot';
  dot.setAttribute('aria-hidden', 'true');
  inner.appendChild(dot);

  const text = document.createElement('span');
  text.className = 'copilot-narrative-overlay-text';
  text.textContent = message;
  inner.appendChild(text);

  el.appendChild(inner);
  document.body.appendChild(el);

  if (!prefersReducedMotion()) {
    requestAnimationFrame(() => el.classList.add(OVERLAY_VISIBLE));
  } else {
    el.classList.add(OVERLAY_VISIBLE);
  }

  return () => removeNarrativeOverlay();
}

export function removeNarrativeOverlay(): void {
  document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((el) => el.remove());
}
