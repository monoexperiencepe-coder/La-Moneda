/** Preferencias de accesibilidad para animaciones narrativas. */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function narrativeScrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

export function narrativeDurationMs(base: number): number {
  return prefersReducedMotion() ? Math.min(base, 600) : base;
}

export function narrativePauseMs(base: number): number {
  return prefersReducedMotion() ? Math.min(base, 200) : base;
}
