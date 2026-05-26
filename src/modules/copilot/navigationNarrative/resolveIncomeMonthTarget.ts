import { aiFocusDevLog } from './devLog';

export function padCopilotMonth(month: number | string): string {
  const n = Math.trunc(Number(month));
  if (!Number.isFinite(n) || n < 1 || n > 12) return String(month).padStart(2, '0');
  return String(n).padStart(2, '0');
}

export type IncomeMonthTargetResult = {
  el: HTMLElement;
  selector: string;
  targetType: string;
  month: string;
  year?: string;
  amountText?: string;
};

const CONTAINER_MAX_W = 700;
const CONTAINER_MAX_H = 400;

function isVisibleRect(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 8 && rect.height > 8;
}

function isContainerTooLarge(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > CONTAINER_MAX_W || rect.height > CONTAINER_MAX_H;
}

function pickBestMonthChild(root: HTMLElement, month: string): HTMLElement | null {
  const candidates = [
    ...root.querySelectorAll<HTMLElement>(`[data-copilot-target="income-month-value"][data-copilot-month="${month}"]`),
    ...root.querySelectorAll<HTMLElement>(`[data-copilot-target="income-month"][data-copilot-month="${month}"]`),
    ...root.querySelectorAll<HTMLElement>(`[data-copilot-month="${month}"]`),
  ];
  for (const c of candidates) {
    if (isVisibleRect(c) && !isContainerTooLarge(c)) return c;
  }
  return candidates[0] ?? null;
}

function readAmount(el: HTMLElement): string | undefined {
  return (
    el.getAttribute('data-copilot-amount')
    ?? el.querySelector('[data-copilot-amount]')?.getAttribute('data-copilot-amount')
    ?? undefined
  );
}

/** Resuelve el elemento DOM exacto de un mes en Ingresos. */
export function resolveIncomeMonthFocusTarget(
  month: number | string,
  year?: number | string,
): IncomeMonthTargetResult | null {
  const mm = padCopilotMonth(month);
  const yy = year != null && String(year).trim() !== '' ? String(year).trim() : null;

  const selectors: Array<{ selector: string; targetType: string }> = [];

  if (yy) {
    selectors.push(
      {
        selector: `[data-copilot-target="income-month-value"][data-copilot-month="${mm}"][data-copilot-year="${yy}"]`,
        targetType: 'income-month-value',
      },
      {
        selector: `[data-copilot-target="income-month"][data-copilot-month="${mm}"][data-copilot-year="${yy}"]`,
        targetType: 'income-month',
      },
    );
  }

  selectors.push(
    {
      selector: `[data-copilot-target="income-month-value"][data-copilot-month="${mm}"]`,
      targetType: 'income-month-value',
    },
    {
      selector: `[data-copilot-target="income-month"][data-copilot-month="${mm}"]`,
      targetType: 'income-month',
    },
    { selector: `[data-copilot-month="${mm}"]`, targetType: 'copilot-month' },
  );

  for (const { selector, targetType } of selectors) {
    const found = document.querySelector(selector) as HTMLElement | null;
    if (!found || !isVisibleRect(found)) continue;

    let el = found;
    if (isContainerTooLarge(el)) {
      const child = pickBestMonthChild(el, mm);
      if (child) el = child;
    }

    const rect = el.getBoundingClientRect();
    const result: IncomeMonthTargetResult = {
      el,
      selector,
      targetType,
      month: mm,
      year: yy ?? el.getAttribute('data-copilot-year') ?? undefined,
      amountText: readAmount(el),
    };

    aiFocusDevLog('[ai-focus:target-selected]', {
      selector,
      month: mm,
      year: result.year ?? null,
      targetType,
      textContent: el.textContent?.trim().slice(0, 80) ?? '',
      rect: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });

    return result;
  }

  const summary = document.getElementById('copilot-income-summary');
  if (summary) {
    const child = pickBestMonthChild(summary, mm);
    if (child && isVisibleRect(child)) {
      const rect = child.getBoundingClientRect();
      aiFocusDevLog('[ai-focus:target-selected]', {
        selector: `#copilot-income-summary [data-copilot-month="${mm}"]`,
        month: mm,
        targetType: 'summary-child',
        textContent: child.textContent?.trim().slice(0, 80) ?? '',
        rect: {
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
      return {
        el: child,
        selector: `#copilot-income-summary [data-copilot-month="${mm}"]`,
        targetType: 'summary-child',
        month: mm,
        year: yy ?? undefined,
        amountText: readAmount(child),
      };
    }
  }

  return null;
}

export function buildIncomeMonthCalloutDescription(
  baseDescription: string | undefined,
  amountText?: string,
): string | undefined {
  const base = baseDescription?.trim();
  if (!base) return amountText ? amountText : undefined;
  if (!amountText) return base;
  if (base.includes(amountText)) return base;
  return `${base} · ${amountText}`;
}
