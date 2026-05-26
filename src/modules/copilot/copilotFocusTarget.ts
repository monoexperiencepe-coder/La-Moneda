/**
 * Scroll + highlight hacia el dato exacto tras navegación del Copiloto.
 */

export type CopilotFocusType = 'month' | 'vehicle' | 'category' | 'record' | 'card' | 'table-row';

export type CopilotFocusSpec = {
  highlightMonth?: string;
  highlightVehicle?: string;
  highlightLabel?: string;
  highlightType?: CopilotFocusType;
  scrollTarget?: string;
};

const HIGHLIGHT_CLASS = 'copilot-highlight';
const TOOLTIP_CLASS = 'copilot-focus-tooltip';
const PING_CLASS = 'copilot-highlight-ping';
const HIGHLIGHT_MS = 4500;

export function parseCopilotFocusFromSearchParams(sp: URLSearchParams): CopilotFocusSpec | null {
  const highlightMonth = sp.get('highlightMonth')?.trim();
  const highlightVehicle = (sp.get('highlightVehicle') ?? sp.get('highlight'))?.trim();
  const highlightLabel = sp.get('highlightLabel')?.trim();
  const highlightType = sp.get('highlightType') as CopilotFocusType | null;
  const scrollTarget = sp.get('scrollTarget')?.trim();
  if (!highlightMonth && !highlightVehicle && !scrollTarget) return null;
  return {
    highlightMonth: highlightMonth || undefined,
    highlightVehicle: highlightVehicle || undefined,
    highlightLabel: highlightLabel || undefined,
    highlightType: highlightType ?? undefined,
    scrollTarget: scrollTarget || undefined,
  };
}

export function copilotFocusQueryKeys(): string[] {
  return ['highlightMonth', 'highlightVehicle', 'highlight', 'highlightLabel', 'highlightType', 'scrollTarget'];
}

export function clearCopilotHighlight(): void {
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((el) => {
    el.classList.remove(HIGHLIGHT_CLASS);
  });
  document.querySelectorAll(`.${PING_CLASS}`).forEach((el) => el.remove());
  document.querySelectorAll(`.${TOOLTIP_CLASS}`).forEach((el) => el.remove());
}

function showCopilotTooltip(anchor: HTMLElement, label: string): void {
  document.querySelectorAll(`.${TOOLTIP_CLASS}`).forEach((el) => el.remove());
  const tip = document.createElement('div');
  tip.className = TOOLTIP_CLASS;
  tip.textContent = label;
  tip.setAttribute('role', 'status');
  document.body.appendChild(tip);

  const rect = anchor.getBoundingClientRect();
  const top = Math.max(8, rect.top + window.scrollY - tip.offsetHeight - 10);
  const left = Math.min(
    window.innerWidth - tip.offsetWidth - 8,
    Math.max(8, rect.left + window.scrollX + rect.width / 2 - tip.offsetWidth / 2),
  );
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;

  requestAnimationFrame(() => tip.classList.add('copilot-focus-tooltip-visible'));
}

function addCopilotPing(anchor: HTMLElement): void {
  const ping = document.createElement('span');
  ping.className = PING_CLASS;
  ping.setAttribute('aria-hidden', 'true');
  const pos = window.getComputedStyle(anchor).position;
  if (pos === 'static') anchor.style.position = 'relative';
  anchor.appendChild(ping);
}

export function highlightCopilotTarget(el: HTMLElement, label?: string): void {
  clearCopilotHighlight();
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove(HIGHLIGHT_CLASS);
  void el.offsetWidth;
  el.classList.add(HIGHLIGHT_CLASS);
  addCopilotPing(el);
  if (label) showCopilotTooltip(el, label);
  window.setTimeout(() => {
    el.classList.remove(HIGHLIGHT_CLASS);
    document.querySelectorAll(`.${PING_CLASS}`).forEach((n) => n.remove());
    document.querySelectorAll(`.${TOOLTIP_CLASS}`).forEach((n) => n.remove());
  }, HIGHLIGHT_MS);
}

export function scrollToCopilotTarget(selector: string, label?: string): boolean {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return false;
  highlightCopilotTarget(el, label);
  return true;
}

/** Limpia params de focus de la URL tras aplicar highlight. */
export function stripCopilotFocusParams(sp: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(sp);
  for (const k of copilotFocusQueryKeys()) next.delete(k);
  return next;
}
