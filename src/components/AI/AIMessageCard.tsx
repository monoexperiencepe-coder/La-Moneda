import React from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import type { AiStructuredResponse } from '../../modules/ai/types';

type Props = {
  structured: AiStructuredResponse;
  toolsUsed?: string[];
  timestamp?: string;
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const AIMessageCard: React.FC<Props> = ({ structured, toolsUsed, timestamp }) => {
  const warnings = structured.warnings ?? [];
  const actions = structured.suggestedActions ?? [];

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-500" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Asistente</span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-slate-800">{structured.summary}</p>

      {warnings.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {warnings.map((w) => (
            <div
              key={w}
              className="flex items-start gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => (
            <span
              key={`${a.label}-${a.description}`}
              className="inline-flex max-w-full flex-col rounded-lg border border-indigo-100 bg-indigo-50/70 px-2.5 py-1.5 text-xs text-indigo-900"
              title={a.description}
            >
              <span className="font-semibold">{a.label}</span>
              <span className="text-indigo-700/90">{a.description}</span>
            </span>
          ))}
        </div>
      )}

      {((toolsUsed?.length ?? 0) > 0 || structured.confidence != null || timestamp) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[10px] text-slate-500">
          {timestamp && <span>{formatTime(timestamp)}</span>}
          {structured.confidence != null && (
            <span>Confianza {Math.round(structured.confidence * 100)}%</span>
          )}
          {toolsUsed && toolsUsed.length > 0 && (
            <span className="truncate" title={toolsUsed.join(', ')}>
              Tools: {toolsUsed.join(', ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default AIMessageCard;
