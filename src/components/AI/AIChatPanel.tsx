import React, { useCallback, useRef, useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { sendAiAssistantMessage } from '../../services/ai/aiAssistantService';
import type { AiChatMessage } from '../../modules/ai/types';
import AIMessageCard from './AIMessageCard';

const QUICK_PROMPTS = [
  'Resume este mes',
  'Qu? registros faltan clasificar',
  'Mu?strame movimientos recientes',
  'VERSA 70 2/3 ARRANCADOR COMPLETO MOD',
];

function newUserMessage(content: string): AiChatMessage {
  return {
    id: `u-${Date.now()}`,
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
  };
}

function formatMsgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

const AIChatPanel: React.FC = () => {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading || !profile?.empresa_id) return;

      const userMsg = newUserMessage(trimmed);
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      scrollToBottom();

      try {
        const { assistant } = await sendAiAssistantMessage({
          message: trimmed,
          history: messages,
          user,
          email: profile.email,
          empresaId: profile.empresa_id,
        });
        setMessages((prev) => [...prev, assistant]);
      } finally {
        setLoading(false);
        scrollToBottom();
      }
    },
    [loading, messages, profile, scrollToBottom, user],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  return (
    <section className="flex h-full min-h-[420px] flex-col rounded-2xl border border-slate-200/90 bg-slate-50/60 shadow-sm">
      <section ref={listRef as React.RefObject<HTMLElement>} className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        {messages.length === 0 && (
          <section className="rounded-xl border border-dashed border-slate-200 bg-white/80 p-4 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-indigo-500" aria-hidden />
            <p className="mt-2 text-sm font-medium text-slate-800">Asistente La Moneda</p>
            <p className="mt-1 text-xs text-slate-500">
              Consulta, resumen y sugerencias. Solo lectura ? no modifica datos.
            </p>
            <section className="mt-3 flex flex-wrap justify-center gap-2">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void sendMessage(q)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:border-indigo-200 hover:bg-indigo-50"
                >
                  {q}
                </button>
              ))}
            </section>
          </section>
        )}

        {messages.map((m) =>
          m.role === 'user' ? (
            <section key={m.id} className="flex justify-end">
              <section className="max-w-[92%] rounded-2xl rounded-br-md bg-indigo-600 px-3 py-2 text-sm text-white shadow-sm sm:max-w-[75%]">
                {m.content}
                <p className="mt-1 text-[10px] text-indigo-100/80">{formatMsgTime(m.createdAt)}</p>
              </section>
            </section>
          ) : m.structured ? (
            <AIMessageCard
              key={m.id}
              structured={m.structured}
              toolsUsed={m.toolsUsed}
              timestamp={m.createdAt}
            />
          ) : (
            <p key={m.id} className="text-sm text-slate-700">
              {m.content}
            </p>
          ),
        )}

        {loading && (
          <section className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Consultando datos?
          </section>
        )}
      </section>

      <form onSubmit={onSubmit} className="border-t border-slate-200 bg-white p-3 sm:p-4">
        <section className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            placeholder="Pregunta sobre gastos, pendientes, resumen?"
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-indigo-200 focus:ring-2"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendMessage(input);
              }
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white disabled:opacity-50"
            aria-label="Enviar"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </section>
      </form>
    </section>
  );
};

export default AIChatPanel;
