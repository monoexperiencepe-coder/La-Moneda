import {
  logAuditDataQualitySubtipos,
  previewDataQualityFixes,
} from './auditDataQualitySubtipos';
import type { Gasto } from '../data/types';
import {
  DATA_QUALITY_TOOLS_DISABLED_MSG,
  isDataQualityToolsEnabled,
} from '../config/dataQualityTools';

export type DataQualityWindowContext = {
  getGastos: () => readonly Gasto[];
};

declare global {
  interface Window {
    auditDataQualitySubtipos: () => void;
    previewDataQualityFixes: () => void;
  }
}

function disabledHandler(): void {
  console.info(DATA_QUALITY_TOOLS_DISABLED_MSG);
}

export function registerDataQualityWindow(ctx: DataQualityWindowContext): void {
  const enabled = isDataQualityToolsEnabled();

  if (!enabled) {
    window.auditDataQualitySubtipos = disabledHandler;
    window.previewDataQualityFixes = disabledHandler;
    console.info(`[data-quality] ${DATA_QUALITY_TOOLS_DISABLED_MSG}`);
    return;
  }

  window.auditDataQualitySubtipos = () => logAuditDataQualitySubtipos(ctx.getGastos());
  window.previewDataQualityFixes = () => previewDataQualityFixes(ctx.getGastos());

  console.info(
    '[data-quality] auditDataQualitySubtipos() | previewDataQualityFixes() — VITE_DATA_QUALITY_TOOLS=1 activo',
  );
}
