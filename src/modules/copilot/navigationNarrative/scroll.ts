import { narrativeScrollBehavior } from './preferences';

const DEFAULT_SCROLL_MS = 720;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Scroll cinematográfico hacia un elemento, centrado en viewport. */
export function cinematicScrollToElement(el: HTMLElement, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();

  const behavior = narrativeScrollBehavior();
  if (behavior === 'auto') {
    el.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
    return Promise.resolve();
  }

  const rect = el.getBoundingClientRect();
  const elTop = rect.top + window.scrollY;
  const elHeight = rect.height;
  const viewport = window.innerHeight;
  const targetY = Math.max(0, elTop - viewport / 2 + elHeight / 2);
  const startY = window.scrollY;
  const distance = targetY - startY;

  if (Math.abs(distance) < 4) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const start = performance.now();
    const duration = DEFAULT_SCROLL_MS;

    const tick = (now: number) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = easeInOutCubic(t);
      window.scrollTo(0, startY + distance * eased);

      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(tick);
  });
}
