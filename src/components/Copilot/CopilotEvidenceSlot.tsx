import React, { useEffect, useState } from 'react';
import {
  consumeCopilotEvidence,
  peekCopilotEvidence,
  type CopilotEvidencePayload,
} from '../../modules/copilot/copilotEvidence';

const EVIDENCE_EVENT = 'copilot:evidence-updated';

const CopilotEvidenceSlot: React.FC = () => {
  const [evidence, setEvidence] = useState<CopilotEvidencePayload | null>(() => peekCopilotEvidence());

  useEffect(() => {
    const refresh = () => setEvidence(peekCopilotEvidence());
    refresh();
    window.addEventListener(EVIDENCE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(EVIDENCE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  if (!evidence) return null;

  return (
    <div
      id="copilot-ai-evidence"
      data-copilot-target="ai-evidence-card"
      data-copilot-evidence-id={evidence.id}
      className="mb-4 rounded-2xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/80 via-white to-emerald-50/40 p-4 shadow-sm ring-1 ring-indigo-900/[0.04]"
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Dato calculado</p>
      <p
        data-copilot-target="ai-evidence-value"
        data-copilot-amount={evidence.value}
        className="mt-1 text-lg font-bold tabular-nums text-indigo-950"
      >
        {evidence.title}
      </p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-emerald-900">{evidence.value}</p>
      {evidence.formula ? (
        <p className="mt-2 text-sm font-medium tabular-nums text-slate-700">{evidence.formula}</p>
      ) : null}
      {evidence.subtitle ? (
        <p className="mt-1 text-xs text-slate-500">{evidence.subtitle}</p>
      ) : null}
      <button
        type="button"
        className="mt-3 text-[11px] font-semibold text-slate-400 hover:text-slate-600"
        onClick={() => {
          consumeCopilotEvidence();
          setEvidence(null);
        }}
      >
        Ocultar
      </button>
    </div>
  );
};

export default CopilotEvidenceSlot;
