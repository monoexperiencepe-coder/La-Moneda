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

/** Callout temporal “mira aquí” cerca del elemento resaltado (fixed layer). */
export function showCopilotCallout(anchor: HTMLElement, title: string, subtitle?: string): void {
  removeCopilotCallout();

  const isMobile = window.innerWidth < 640;

  const callout = document.createElement('div');
  callout.className = `${CALLOUT_CLASS}${isMobile ? ' copilot-callout--mobile' : ' copilot-callout--desktop'}`;
  callout.setAttribute('role', 'status');
  callout.setAttribute('aria-live', 'polite');
  callout.style.position = 'fixed';
  callout.style.zIndex = '99995';
  callout.style.pointerEvents = 'none';

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
  arrow.style.position = 'fixed';
  arrow.style.zIndex = '99994';
  document.body.appendChild(arrow);

  const rect = anchor.getBoundingClientRect();
  const calloutRect = callout.getBoundingClientRect();
  const gap = isMobile ? 10 : 12;
  const viewportPad = isMobile ? 10 : 16;

  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;
  const placeBelow = spaceAbove < calloutRect.height + gap + 24 && spaceBelow > spaceAbove;

  let top: number;
  let arrowTop: number;

  if (placeBelow) {
    top = rect.bottom + gap;
    arrowTop = rect.bottom + gap - 6;
    arrow.classList.add(`${ARROW_CLASS}--down`);
  } else {
    top = rect.top - calloutRect.height - gap;
    arrowTop = rect.top - gap + 2;
    arrow.classList.add(`${ARROW_CLASS}--up`);
  }

  top = Math.max(viewportPad, top);

  const centerX = rect.left + rect.width / 2;
  const left = Math.min(
    window.innerWidth - calloutRect.width - viewportPad,
    Math.max(viewportPad, centerX - calloutRect.width / 2),
  );

  callout.style.top = `${top}px`;
  callout.style.left = `${left}px`;

  const arrowLeft = centerX - (isMobile ? 9 : 11);
  arrow.style.top = `${arrowTop}px`;
  arrow.style.left = `${arrowLeft}px`;

  if (!prefersReducedMotion()) {
    requestAnimationFrame(() => {
      callout.classList.add(CALLOUT_VISIBLE);
      callout.style.opacity = '1';
      arrow.classList.add(`${ARROW_CLASS}--visible`);
      arrow.style.opacity = '1';
    });
  } else {
    callout.classList.add(CALLOUT_VISIBLE);
    callout.style.opacity = '1';
    arrow.classList.add(`${ARROW_CLASS}--visible`);
    arrow.style.opacity = '1';
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
