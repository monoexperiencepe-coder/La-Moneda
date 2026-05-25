import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Cpu } from 'lucide-react';
import type { AiAssistantDebugInfo } from '../../modules/ai/types';

type Props = {
  debug: AiAssistantDebugInfo;
};

const AIDebugPanel: React.FC<Props> = ({ debug }) => {
  const [open, setOpen] = useState(false);

  const toolDurationEntries = Object.entries(debug.toolDurationsMs ?? {}).filter(
    ([, ms]) => typeof ms === 'number' && ms > 0,
  );

  const tokenSummary =
    debug.tokens?.total != null
      ? `${debug.tokens.total} tok`
      : null;

  return (
    <div className="overflow-hidden rounded-xl border border-dashed border-slate-200 text-[11px] text-slate-500">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50/80 transition-colors"
      >
        <Cpu className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
        <span className="flex-1 font-medium text-slate-400">
          Debug IA
          {!open && (
            <span className="ml-2 font-normal">
              {[
                debug.provider,
                debug.model?.split('/').pop(),
                `${Math.round(debug.durationMs)}ms`,
                tokenSummary,
                debug.toolsUsed.length ? `${debug.toolsUsed.length} tools` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-3 w-3 shrink-0" aria-hidden />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
        )}
      </button>

      {open && (
        <dl className="divide-y divide-slate-100 border-t border-dashed border-slate-200 text-[11px]">
          {(
            [
              ['Timestamp', new Date(debug.timestamp).toLocaleString('es-PE')],
              ['Duración', `${Math.round(debug.durationMs)} ms`],
              ...(debug.provider ? [['Proveedor', debug.provider]] : []),
              ...(debug.model ? [['Modelo', debug.model]] : []),
              ...(debug.tokens?.total != null
                ? [
                    [
                      'Tokens',
                      [
                        String(debug.tokens.total),
                        debug.tokens.prompt != null ? `in ${debug.tokens.prompt}` : null,
                        debug.tokens.completion != null ? `out ${debug.tokens.completion}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · '),
                    ],
                  ]
                : []),
              ...(debug.toolsUsed.length > 0 ? [['Tools', debug.toolsUsed.join(', ')]] : []),
              ...(debug.deniedTools.length > 0
                ? [['Bloqueadas', debug.deniedTools.join(', ')]]
                : []),
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 px-3 py-1.5">
              <dt className="shrink-0 text-slate-400">{label}</dt>
              <dd className="truncate text-right text-slate-600">{value}</dd>
            </div>
          ))}

          {toolDurationEntries.length > 0 && (
            <div className="px-3 py-1.5">
              <dt className="mb-1 text-slate-400">Duración por tool</dt>
              <dd className="space-y-0.5">
                {toolDurationEntries.map(([name, ms]) => (
                  <div key={name} className="flex justify-between gap-2 text-slate-600">
                    <span className="truncate">{name}</span>
                    <span>{Math.round(ms as number)} ms</span>
                  </div>
                ))}
              </dd>
            </div>
          )}

          {debug.toolErrors.length > 0 && (
            <div className="px-3 py-1.5">
              <dt className="mb-1 text-red-400">Errores</dt>
              <dd className="space-y-1">
                {debug.toolErrors.map((e) => (
                  <div
                    key={`${e.name}-${e.error}`}
                    className="rounded-lg bg-red-50 px-2 py-1 text-red-700"
                  >
                    <span className="font-medium">{e.name}</span>
                    {e.denied ? ' (denegada)' : ''}: {e.error}
                  </div>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
};

export default AIDebugPanel;
