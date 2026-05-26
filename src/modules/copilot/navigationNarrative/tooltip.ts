import { prefersReducedMotion } from './preferences';

const TOOLTIP_CLASS = 'copilot-narrative-tooltip';
const TOOLTIP_VISIBLE = 'copilot-narrative-tooltip-visible';

export function removeNarrativeTooltips(): void {
  document.querySelectorAll(`.${TOOLTIP_CLASS}`).forEach((el) => el.remove());
}

export function showNarrativeTooltip(anchor: HTMLElement, label: string, description?: string): void {
  removeNarrativeTooltips();

  const tip = document.createElement('div');
  tip.className = TOOLTIP_CLASS;
  tip.setAttribute('role', 'status');
  tip.setAttribute('aria-live', 'polite');

  const title = document.createElement('p');
  title.className = 'copilot-narrative-tooltip-title';
  title.textContent = label;
  tip.appendChild(title);

  if (description?.trim()) {
    const desc = document.createElement('p');
    desc.className = 'copilot-narrative-tooltip-desc';
    desc.textContent = description.trim();
    tip.appendChild(desc);
  }

  const pointer = document.createElement('span');
  pointer.className = 'copilot-narrative-tooltip-pointer';
  pointer.setAttribute('aria-hidden', 'true');
  tip.appendChild(pointer);

  document.body.appendChild(tip);

  const rect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const top = Math.max(12, rect.top + window.scrollY - tipRect.height - 14);
  const left = Math.min(
    window.innerWidth - tipRect.width - 12,
    Math.max(12, rect.left + window.scrollX + rect.width / 2 - tipRect.width / 2),
  );
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;

  if (!prefersReducedMotion()) {
    requestAnimationFrame(() => tip.classList.add(TOOLTIP_VISIBLE));
  } else {
    tip.classList.add(TOOLTIP_VISIBLE);
  }
}

export function fadeOutNarrativeTooltip(): Promise<void> {
  const tip = document.querySelector(`.${TOOLTIP_CLASS}.${TOOLTIP_VISIBLE}`) as HTMLElement | null;
  if (!tip) return Promise.resolve();

  if (prefersReducedMotion()) {
    tip.remove();
    return Promise.resolve();
  }

  tip.classList.remove(TOOLTIP_VISIBLE);
  tip.classList.add('copilot-narrative-tooltip-exiting');
  return new Promise((resolve) => {
    window.setTimeout(() => {
      tip.remove();
      resolve();
    }, 280);
  });
}
