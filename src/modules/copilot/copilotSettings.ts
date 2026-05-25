const STORAGE_KEY = 'la_moneda_copilot_auto_navigate';

/** Auto-navegar al detectar acción segura (default: false — requiere click). */
export function getCopilotAutoNavigate(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setCopilotAutoNavigate(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* noop */
  }
}

const PANEL_OPEN_KEY = 'la_moneda_copilot_panel_open';

export function getCopilotPanelOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function setCopilotPanelOpen(open: boolean): void {
  try {
    localStorage.setItem(PANEL_OPEN_KEY, open ? '1' : '0');
  } catch {
    /* noop */
  }
}

// ─── Navigation history ───────────────────────────────────────────────────────

const NAV_HISTORY_KEY = 'la_moneda_copilot_nav_history';
const MAX_HISTORY = 5;

export interface CopilotNavHistoryItem {
  /** Human-readable label, e.g. "Ingresos 2024" */
  label: string;
  /** Full URL path + query string, e.g. "/finanzas/ingresos?year=2024" */
  path: string;
  ts: number;
}

export function getCopilotNavHistory(): CopilotNavHistoryItem[] {
  try {
    const raw = localStorage.getItem(NAV_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CopilotNavHistoryItem[];
  } catch {
    return [];
  }
}

export function addCopilotNavHistory(item: Omit<CopilotNavHistoryItem, 'ts'>): void {
  try {
    const existing = getCopilotNavHistory().filter((h) => h.path !== item.path);
    const next: CopilotNavHistoryItem[] = [
      { ...item, ts: Date.now() },
      ...existing,
    ].slice(0, MAX_HISTORY);
    localStorage.setItem(NAV_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}
