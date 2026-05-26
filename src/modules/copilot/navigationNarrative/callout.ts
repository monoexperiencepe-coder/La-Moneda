import { prefersReducedMotion } from './preferences';

const CALLOUT_CLASS = 'copilot-callout';
const CALLOUT_VISIBLE = 'copilot-callout-visible';
const SCRIM_CLASS = 'copilot-narrative-scrim';
const ARROW_CLASS = 'copilot-callout-arrow';

export function showNarrativeScrim(): void {
  removeNarrativeScrim();
  const scrim = document.createElement('div');
  scrim.className = SCRIM_CLASS;
  scrim.setAttribute('aria-hidden', 'true');
  document.body.appendChild(scrim);
  requestAnimationFrame(() => scrim.classList.add(`${SCRIM_CLASS}--visible`));
}

export function removeNarrativeScrim(): void {
  document.querySelectorAll(`.${SCRIM_CLASS}`).forEach((el) => el.remove());
}

export function removeCopilotCallout(): void {
  document.querySelectorAll(`.${CALLOUT_CLASS}`).forEach((el) => el.remove());
  document.querySelectorAll(`.${ARROW_CLASS}`).forEach((el) => el.remove());
}

/** Callout temporal “mira aquí” cerca del elemento resaltado. */
export function showCopilotCallout(anchor: HTMLElement, title: string, subtitle?: string): void {
  removeCopilotCallout();

  const callout = document.createElement('div');
  callout.className = CALLOUT_CLASS;
  callout.setAttribute('role', 'status');
  callout.setAttribute('aria-live', 'polite');

  const icon = document.createElement('span');
  icon.className = 'copilot-callout-icon';
  icon.textContent = '✨';
  icon.setAttribute('aria-hidden', 'true');
  callout.appendChild(icon);

  const body = document.createElement('div');
  body.className = 'copilot-callout-body';

  const titleEl = document.createElement('p');
  titleEl.className = 'copilot-callout-title';
  titleEl.textContent = title;
  body.appendChild(titleEl);

  if (subtitle?.trim()) {
    const sub = document.createElement('p');
    sub.className = 'copilot-callout-subtitle';
    sub.textContent = subtitle.trim();
    body.appendChild(sub);
  }

  callout.appendChild(body);
  document.body.appendChild(callout);

  const arrow = document.createElement('span');
  arrow.className = ARROW_CLASS;
  arrow.setAttribute('aria-hidden', 'true');
  document.body.appendChild(arrow);

  const rect = anchor.getBoundingClientRect();
  const calloutRect = callout.getBoundingClientRect();
  const top = Math.max(12, rect.top + window.scrollY - calloutRect.height - 18);
  const left = Math.min(
    window.innerWidth - calloutRect.width - 12,
    Math.max(12, rect.left + window.scrollX + rect.width / 2 - calloutRect.width / 2),
  );
  callout.style.top = `${top}px`;
  callout.style.left = `${left}px`;

  const arrowTop = rect.top + window.scrollY - 8;
  const arrowLeft = rect.left + window.scrollX + rect.width / 2 - 8;
  arrow.style.top = `${arrowTop}px`;
  arrow.style.left = `${arrowLeft}px`;

  if (!prefersReducedMotion()) {
    requestAnimationFrame(() => {
      callout.classList.add(CALLOUT_VISIBLE);
      arrow.classList.add(`${ARROW_CLASS}--visible`);
    });
  } else {
    callout.classList.add(CALLOUT_VISIBLE);
    arrow.classList.add(`${ARROW_CLASS}--visible`);
  }
}

export function fadeOutCopilotCallout(): Promise<void> {
  const callout = document.querySelector(`.${CALLOUT_CLASS}.${CALLOUT_VISIBLE}`) as HTMLElement | null;
  const arrow = document.querySelector(`.${ARROW_CLASS}--visible`) as HTMLElement | null;

  if (!callout) {
    removeCopilotCallout();
    return Promise.resolve();
  }

  if (prefersReducedMotion()) {
    removeCopilotCallout();
    return Promise.resolve();
  }

  callout.classList.remove(CALLOUT_VISIBLE);
  callout.classList.add('copilot-callout-exiting');
  arrow?.classList.remove(`${ARROW_CLASS}--visible`);

  return new Promise((resolve) => {
    window.setTimeout(() => {
      removeCopilotCallout();
      resolve();
    }, 320);
  });
}
