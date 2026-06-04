import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { COPILOT_STRICT_FACT_MODE } from '../../config/copilotAudit';
import {
  clearCopilotTraceHistory,
  getCopilotTraceSessions,
  type CopilotTraceSession,
} from '../../modules/copilot/copilotTrace';
import { auditCopilotInventory } from '../../modules/copilot/auditCopilotInventory';
import {
  ensureCopilotAuditRegistered,
} from '../../modules/copilot/registerCopilotAudit';
import { permissionUserFromAuth } from '../../utils/permissions';

const CopilotDebug: React.FC = () => {
  const { user, profile } = useAuth();
  const permissionUser = permissionUserFromAuth(user, profile?.email);
  const [sessions, setSessions] = useState<readonly CopilotTraceSession[]>(() =>
    getCopilotTraceSessions(),
  );
  const [testLog, setTestLog] = useState<string>('');

  useEffect(() => {
    ensureCopilotAuditRegistered({
      getUser: () => (user ? permissionUserFromAuth(user, profile?.email ?? null) : null),
      getEmpresaId: () => profile?.empresa_id ?? import.meta.env.VITE_EMPRESA_ID ?? null,
    });
  }, [user, profile?.email, profile?.empresa_id]);

  const refresh = useCallback(() => {
    setSessions([...getCopilotTraceSessions()]);
  }, []);

  const runTests = async () => {
    if (typeof window.runCopilotAuditTests !== 'function') {
      ensureCopilotAuditRegistered({
        getUser: () => (user ? permissionUserFromAuth(user, profile?.email ?? null) : null),
        getEmpresaId: () => profile?.empresa_id ?? import.meta.env.VITE_EMPRESA_ID ?? null,
      });
    }
    if (typeof window.runCopilotAuditTests !== 'function') {
      setTestLog('runCopilotAuditTests no registrado tras reintento');
      return;
    }
    setTestLog('Ejecutando pruebas…');
    const rows = await window.runCopilotAuditTests();
    setTestLog(JSON.stringify(rows, null, 2));
    refresh();
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Copilot Debug</h1>
          <p className="text-sm text-slate-500 mt-1">
            Panel oculto · trazas de conversación y herramientas
          </p>
        </div>
        <Link to="/asistente" className="text-sm font-medium text-violet-600 hover:underline">
          ← Asistente
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm space-y-2">
        <p>
          <span className="font-semibold">STRICT_FACT_MODE:</span>{' '}
          {COPILOT_STRICT_FACT_MODE ? 'true' : 'false'}{' '}
          <span className="text-slate-500">(VITE_COPILOT_STRICT_FACT_MODE)</span>
        </p>
        <p className="text-slate-600">
          Consola:{' '}
          <code className="text-xs bg-white px-1 rounded">window.runCopilotCertification()</code>,{' '}
          <code className="text-xs bg-white px-1 rounded">window.auditCopilot()</code>,{' '}
          <code className="text-xs bg-white px-1 rounded">window.runCopilotAuditTests()</code>
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => void window.runCopilotCertification?.()}
            className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700"
          >
            Certificación real (A–K)
          </button>
          <button
            type="button"
            onClick={() => {
              auditCopilotInventory(permissionUser);
            }}
            className="rounded-lg bg-white border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100"
          >
            auditCopilot()
          </button>
          <button
            type="button"
            onClick={() => void runTests()}
            className="rounded-lg bg-violet-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-violet-700"
          >
            Ejecutar tests Fase 4
          </button>
          <button
            type="button"
            onClick={() => {
              clearCopilotTraceHistory();
              refresh();
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100"
          >
            Limpiar trazas
          </button>
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100"
          >
            Actualizar
          </button>
        </div>
      </div>

      {testLog ? (
        <pre className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-[11px] overflow-x-auto max-h-64">
          {testLog}
        </pre>
      ) : null}

      <div className="space-y-4">
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-500">Sin sesiones trazadas. Haz una pregunta en /asistente.</p>
        ) : (
          sessions.map((s) => (
            <article
              key={s.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
            >
              <header className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                <span>{new Date(s.timestamp).toLocaleString('es-PE')}</span>
                <span className="font-mono">{s.id}</span>
              </header>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pregunta</p>
                <p className="text-sm font-medium text-slate-900">{s.query}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-slate-400">Intent</p>
                  <p className="font-semibold text-slate-800">
                    {s.intent.intent} ({Math.round(s.intent.confidence * 100)}%)
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Herramientas</p>
                  <p className="font-semibold text-slate-800">
                    {s.final?.toolsUsed?.join(', ') || s.toolsSelected.join(', ') || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Tokens</p>
                  <p className="font-semibold text-slate-800">{s.final?.tokensTotal ?? '—'}</p>
                </div>
                <div>
                  <p className="text-slate-400">Tiempo</p>
                  <p className="font-semibold text-slate-800">
                    {s.final ? `${Math.round(s.final.durationMs)} ms` : '—'}
                  </p>
                </div>
              </div>

              {s.toolResults.length > 0 ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Rows por tool
                  </p>
                  <ul className="text-xs space-y-1 font-mono text-slate-700">
                    {s.toolResults.map((tr, i) => (
                      <li key={`${tr.tool}-${i}`}>
                        {tr.tool}: rows={tr.rows ?? '?'} · {tr.durationMs}ms · ok={String(tr.ok)}
                        {tr.error ? ` · err=${tr.error}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {s.final?.summary ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Respuesta</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{s.final.summary}</p>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
};

export default CopilotDebug;
