import type { ClasificacionSugerenciaFuente } from './clasificacionMemoriaTypes';

export type ClasificacionFeedbackResultado =
  | 'correcto'
  | 'parcialmente_correcto'
  | 'incorrecto'
  | 'ignorado';

export type ClasificacionCorrectionLevel =
  | 'none'
  | 'subtipo_only'
  | 'categoria_only'
  | 'full_change';

export type ClasificacionFeedbackRow = {
  id: number;
  empresa_id: string;
  gasto_id: number;
  sugerencia_original_tipo: string | null;
  sugerencia_original_subtipo: string | null;
  resultado_final_tipo: string | null;
  resultado_final_subtipo: string | null;
  confianza_original: number | null;
  fuente_original: string | null;
  feedback_resultado: ClasificacionFeedbackResultado;
  correction_level: ClasificacionCorrectionLevel;
  created_at: string;
};

export type ClasificacionFeedbackResumen = {
  feedback_resultado: ClasificacionFeedbackResultado;
  correction_level: ClasificacionCorrectionLevel;
};

export type ClasificacionFeedbackInput = {
  gastoId: number;
  sugerenciaTipo: string | null;
  sugerenciaSubtipo: string | null;
  resultadoTipo?: string | null;
  resultadoSubtipo?: string | null;
  confianzaOriginal?: number | null;
  fuenteOriginal?: ClasificacionSugerenciaFuente | string | null;
  feedbackResultado?: ClasificacionFeedbackResultado;
  correctionLevel?: ClasificacionCorrectionLevel;
};
