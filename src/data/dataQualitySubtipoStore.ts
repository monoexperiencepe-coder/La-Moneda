/**
 * Estado local (ignore / revisión manual) para conciliación de subtipos — no toca BD.
 */
const STORAGE_KEY = 'la-moneda:data-quality-subtipo-actions';

export type DataQualityLocalAction = 'ignored' | 'manual_review';

export interface DataQualityLocalEntry {
  action: DataQualityLocalAction;
  at: string;
  by?: string;
}

function readAll(): Record<string, DataQualityLocalEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, DataQualityLocalEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, DataQualityLocalEntry>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getDataQualityLocalAction(gastoId: string): DataQualityLocalEntry | null {
  return readAll()[String(gastoId)] ?? null;
}

export function setDataQualityLocalAction(
  gastoId: string,
  action: DataQualityLocalAction,
  by?: string,
): void {
  const all = readAll();
  all[String(gastoId)] = { action, at: new Date().toISOString(), by };
  writeAll(all);
}

export function clearDataQualityLocalAction(gastoId: string): void {
  const all = readAll();
  delete all[String(gastoId)];
  writeAll(all);
}

export function listDataQualityLocalActions(): Record<string, DataQualityLocalEntry> {
  return readAll();
}
