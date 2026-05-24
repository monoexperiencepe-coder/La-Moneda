import React from 'react';
import { Sparkles } from 'lucide-react';
import AIChatPanel from '../components/AI/AIChatPanel';

const AIPage: React.FC = () => {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
      <header className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <section>
          <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Asistente IA</h1>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            Consulta financiera y operativa. Fase 1: solo lectura y sugerencias — sin cambios automáticos.
          </p>
        </section>
      </header>

      <AIChatPanel />
    </section>
  );
};

export default AIPage;
