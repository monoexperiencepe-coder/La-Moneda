import type {
  ClasificacionCorrectionLevel,
  ClasificacionFeedbackResultado,
} from '../modules/ai/clasificacionFeedbackTypes';
import { normKey } from './subtipoFinancieroLabel';

function normTipo(t: string | null | undefined): string {
  return (t ?? '').trim();
}

function normSubtipo(s: string | null | undefined): string {
  return normKey(s ?? '');
}

export function resolveClasificacionFeedback(
  sugerenciaTipo: string | null | undefined,
  sugerenciaSubtipo: string | null | undefined,
  resultadoTipo: string | null | undefined,
  resultadoSubtipo: string | null | undefined,
): {
  feedback_resultado: ClasificacionFeedbackResultado;
  correction_level: ClasificacionCorrectionLevel;
} {
  const sTipo = normTipo(sugerenciaTipo);
  const sSub = normSubtipo(sugerenciaSubtipo);
  const rTipo = normTipo(resultadoTipo);
  const rSub = normSubtipo(resultadoSubtipo);

  if (!sTipo && !sSub) {
    return { feedback_resultado: 'incorrecto', correction_level: 'full_change' };
  }

  const tipoIgual = sTipo === rTipo;
  const subIgual = sSub === rSub || (!sSub && !rSub);

  if (tipoIgual && subIgual) {
    return { feedback_resultado: 'correcto', correction_level: 'none' };
  }
  if (tipoIgual && !subIgual) {
    return { feedback_resultado: 'parcialmente_correcto', correction_level: 'subtipo_only' };
  }
  if (!tipoIgual && subIgual) {
    return { feedback_resultado: 'incorrecto', correction_level: 'categoria_only' };
  }
  return { feedback_resultado: 'incorrecto', correction_level: 'full_change' };
}

export function feedbackIgnorado(): {
  feedback_resultado: ClasificacionFeedbackResultado;
  correction_level: ClasificacionCorrectionLevel;
} {
  return { feedback_resultado: 'ignorado', correction_level: 'none' };
}
