import React from 'react';
import { Sparkles } from 'lucide-react';
import type { AiStructuredResponse, AiSuggestedAction } from '../../modules/ai/types';
import AIResponseRenderer from './AIResponseRenderer';

type PendienteSugerenciaRow = {
  id: number;
  motivo?: string | null;
  placa?: string | null;
  tipo_gasto_sugerido?: string | null;
  subtipo_sugerido?: string | null;
  confianza?: number;
};

type Props = {
  structured: AiStructuredResponse;
  timestamp?: string;
  onAction?: (action: AiSuggestedAction) => void;
  /** Oculta hora (copiloto flotante). */
  hideMeta?: boolean;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function extractSugerencias(data: AiStructuredResponse['data']): PendienteSugerenciaRow[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const raw = (data as Record<string, unknown>).sugerencias;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is PendienteSugerenciaRow => x != null && typeof x === 'object' && 'id' in x,
  );
}

const AIMessageCard: React.FC<Props> = ({ structured, timestamp, onAction, hideMeta = false }) => {
  const sugerencias = extractSugerencias(structured.data);

  return (
    <div className="max-w-full rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm sm:p-4">
      {/* Header */}
      <div className="mb-2.5 flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
          Asistente
        </span>
      </div>

      {/* Main content */}
      <AIResponseRenderer structured={structured} onAction={onAction} />

      {/* Sugerencias table (pendientes con clasificación sugerida) */}
      {sugerencias.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100">
          <table className="min-w-full text-left text-[11px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">ID</th>
                <th className="px-2 py-1.5 font-semibold">Motivo</th>
                <th className="px-2 py-1.5 font-semibold">Sugerencia</th>
                <th className="px-2 py-1.5 font-semibold">Conf.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sugerencias.slice(0, 25).map((s) => (
                <tr key={s.id} className="text-slate-800">
                  <td className="whitespace-nowrap px-2 py-1.5">#{s.id}</td>
                  <td className="max-w-[140px] truncate px-2 py-1.5" title={s.motivo ?? ''}>
                    {s.motivo ?? '—'}
                    {s.placa ? ` (${s.placa})` : ''}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="font-medium">{s.tipo_gasto_sugerido ?? '—'}</span>
                    {s.subtipo_sugerido ? ` / ${s.subtipo_sugerido}` : ''}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {s.confianza != null ? `${Math.round(s.confianza * 100)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sugerencias.length > 25 && (
            <p className="border-t border-slate-100 px-2 py-1 text-[10px] text-slate-500">
              +{sugerencias.length - 25} más en la respuesta del asistente
            </p>
          )}
          <p className="border-t border-indigo-100 bg-indigo-50/50 px-2 py-1.5 text-[10px] text-indigo-800">
            Revisar manualmente en Finanzas — no hay aplicación automática en fase 1.
          </p>
        </div>
      )}

      {/* Footer: solo hora (tools/confianza → Debug IA) */}
      {!hideMeta && timestamp && (
        <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
          <span>{formatTime(timestamp)}</span>
        </div>
      )}
    </div>
  );
};

export default AIMessageCard;
