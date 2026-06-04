/** Modo estricto: no inventar ceros ni negar datos sin evidencia de tool. */
export const COPILOT_STRICT_FACT_MODE =
  import.meta.env.VITE_COPILOT_STRICT_FACT_MODE === 'true' ||
  import.meta.env.VITE_COPILOT_STRICT_FACT_MODE === '1';
