export type ClasificacionMemoriaSource =
  | 'aplicacion_ia'
  | 'correccion_manual'
  | 'movimiento_manual'
  | 'operador'
  | 'admin';

export type ClasificacionSugerenciaFuente = 'memoria_humana' | 'heuristica' | 'mixto';

export type ClasificacionMemoriaMatchInfo = {
  texto_relacionado: string;
  score: number;
  veces_confirmado: number;
  memoria_id?: number;
};

export type ClasificacionMemoriaRow = {
  id: number;
  empresa_id: string;
  texto_normalizado: string;
  texto_original: string;
  tipo_gasto_final: string;
  subtipo_final: string;
  vehicle_context: string | null;
  confidence_humana: number | null;
  source: ClasificacionMemoriaSource;
  veces_usado: number;
  veces_confirmado: number;
  veces_corregido: number;
  updated_at: string;
};
