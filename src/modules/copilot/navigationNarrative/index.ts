export type {
  NarrativeStep,
  NarrativeSequence,
  NarrativeHighlightKind,
  NarrativeRunOptions,
} from './types';

export {
  queueNarrativeNavigation,
  consumeNarrativeForPath,
  peekNarrativeForPath,
  clearPendingNarrative,
  resolveStepTarget,
} from './storage';

export {
  runNarrativeSequence,
  cancelNarrativeNavigation,
  isNarrativeRunning,
  installNarrativeInterruptHandlers,
} from './engine';

export { buildNarrativeFromSuggestedAction, buildNarrativeFromCopilotParams, buildIngresosStep } from './buildFromAction';

export {
  activateAIFocusMode,
  deactivateAIFocusMode,
  cancelAIFocusMode,
} from './aiFocusMode';

export { cinematicScrollToElement } from './scroll';

export { clearNarrativeHighlight } from './highlight';

export { prefersReducedMotion } from './preferences';
