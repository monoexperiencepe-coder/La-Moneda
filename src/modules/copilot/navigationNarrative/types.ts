/** Tipos para secuencias de navegación narrativa del Copiloto. */

export type NarrativeHighlightKind = 'income' | 'warning' | 'success' | 'neutral' | 'anomaly';

export type NarrativeStep = {
  /** Id de elemento DOM o selector CSS (#id / .class). */
  target: string;
  label: string;
  description?: string;
  duration?: number;
  highlightType?: NarrativeHighlightKind;
  scroll?: boolean;
  /** Pausa antes de iniciar este paso (ms). */
  pauseBeforeMs?: number;
  /** Filtros opcionales a aplicar en destino antes del highlight. */
  applyMonth?: number | string;
  applyYear?: number | string;
};

export type NarrativeSequence = {
  id: string;
  path: string;
  steps: NarrativeStep[];
  showOverlay?: boolean;
};

export type NarrativeRunOptions = {
  resolveTarget: (step: NarrativeStep) => HTMLElement | null;
  onApplyFilters?: (step: NarrativeStep) => void;
  /** Delay inicial antes del primer paso (espera render). */
  initialDelayMs?: number;
};
