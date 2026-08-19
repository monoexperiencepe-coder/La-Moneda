import React, { useMemo, useState } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { usePaymentSettings } from '../../context/PaymentSettingsContext';
import type { PaymentAccount, PaymentAccountInput, PaymentAccountMethod } from '../../services/paymentSettingsService';
import { canManagePaymentAccounts } from '../../utils/roles';

const EMPTY: PaymentAccountInput = { method: 'Yape', label: '', phoneNumber: null, bankName: null, accountNumber: null, cci: null, accountHolder: null, paymentNote: null, isActive: true, sortOrder: 0 };

function inputFrom(account: PaymentAccount): PaymentAccountInput {
  return { method: account.method, label: account.label, phoneNumber: account.phoneNumber, bankName: account.bankName, accountNumber: account.accountNumber, cci: account.cci, accountHolder: account.accountHolder, paymentNote: account.paymentNote, isActive: account.isActive, sortOrder: account.sortOrder };
}

const Field: React.FC<{ label: string; value: string | null | undefined; onChange: (value: string) => void; placeholder?: string }> = ({ label, value, onChange, placeholder }) => (
  <label className="block">
    <span className="text-xs font-semibold text-gray-600">{label}</span>
    <input className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
  </label>
);

const PaymentAccountsSettings: React.FC = () => {
  const { role } = useAuth();
  const { accounts, status, error, usingLegacyFallback, reload, save } = usePaymentSettings();
  const canEdit = canManagePaymentAccounts(role);
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState<PaymentAccountInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const wallets = useMemo(() => accounts.filter((a) => a.method === 'Yape' || a.method === 'Plin'), [accounts]);
  const transfers = useMemo(() => accounts.filter((a) => a.method === 'Transferencia'), [accounts]);
  const others = useMemo(() => accounts.filter((a) => !['Yape', 'Plin', 'Transferencia'].includes(a.method)), [accounts]);

  const start = (account?: PaymentAccount) => {
    setEditingId(account?.id ?? null);
    setDraft(account ? inputFrom(account) : { ...EMPTY, sortOrder: accounts.length + 1 });
    setMessage(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.label.trim()) { setMessage('La etiqueta es obligatoria.'); return; }
    if ((draft.method === 'Yape' || draft.method === 'Plin') && !/^\d{9}$/.test(draft.phoneNumber?.trim() ?? '')) {
      setMessage('Yape y Plin requieren un número de 9 dígitos.'); return;
    }
    if (draft.method === 'Transferencia' && !(draft.accountNumber?.trim())) {
      setMessage('La transferencia requiere número de cuenta.'); return;
    }
    if (draft.cci && !/^\d{20}$/.test(draft.cci.trim())) { setMessage('El CCI debe contener 20 dígitos.'); return; }
    setBusy(true);
    try {
      await save(editingId ?? null, draft);
      setMessage('Datos de pago guardados correctamente.');
      setEditingId(undefined);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo guardar.');
    } finally { setBusy(false); }
  };

  const renderGroup = (title: string, rows: PaymentAccount[]) => (
    <section className="space-y-2">
      <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
        {rows.map((account) => (
          <button key={account.id} type="button" disabled={!canEdit} onClick={() => start(account)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-gray-50 disabled:cursor-default">
            <span className={`h-2.5 w-2.5 rounded-full ${account.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-gray-900">{account.label}</span>
              <span className="block truncate text-xs text-gray-500">{account.method === 'Transferencia' ? [account.bankName, account.accountNumber, account.cci ? `CCI ${account.cci}` : null].filter(Boolean).join(' · ') : [account.method, account.phoneNumber, account.accountHolder].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="text-xs text-gray-400">{account.isActive ? 'Activo' : 'Inactivo'}</span>
          </button>
        ))}
        {!rows.length ? <p className="p-3 text-xs text-gray-400">Sin destinos configurados.</p> : null}
      </div>
    </section>
  );

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="font-bold text-gray-900">Datos de pago</h2><p className="text-xs text-gray-500">Destinos utilizados en operaciones nuevas. Los registros históricos no cambian.</p></div>
        {canEdit ? <button type="button" onClick={() => start()} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"><Plus size={14} /> Agregar</button> : null}
      </div>
      {status === 'loading' ? <p className="text-sm text-gray-500">Cargando configuración…</p> : null}
      {usingLegacyFallback ? <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">No se pudo consultar `payment_accounts`. Los formularios continúan con el catálogo legacy. <button type="button" className="font-bold underline" onClick={() => void reload()}>Reintentar</button></div> : null}
      {error && status !== 'fallback' ? <p className="text-xs text-red-600">{error}</p> : null}
      {renderGroup('Yape / Plin', wallets)}
      {renderGroup('Transferencias', transfers)}
      {others.length ? renderGroup('Otros métodos', others) : null}

      {editingId !== undefined ? (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
          <div className="flex items-center justify-between"><h3 className="text-sm font-bold">{editingId ? 'Editar destino' : 'Agregar destino'}</h3><button type="button" onClick={() => setEditingId(undefined)}><X size={16} /></button></div>
          <label className="block"><span className="text-xs font-semibold text-gray-600">Método</span><select className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={draft.method} onChange={(e) => setDraft((d) => ({ ...d, method: e.target.value as PaymentAccountMethod }))}><option>Yape</option><option>Plin</option><option>Transferencia</option><option>Efectivo</option><option>Otros</option><option>Tarjeta</option></select></label>
          <Field label="Etiqueta" value={draft.label} onChange={(label) => setDraft((d) => ({ ...d, label }))} />
          {draft.method === 'Yape' || draft.method === 'Plin' ? <Field label="Número" value={draft.phoneNumber} onChange={(phoneNumber) => setDraft((d) => ({ ...d, phoneNumber }))} placeholder="9 dígitos" /> : null}
          {draft.method === 'Transferencia' ? <><Field label="Banco" value={draft.bankName} onChange={(bankName) => setDraft((d) => ({ ...d, bankName }))} /><Field label="Número de cuenta" value={draft.accountNumber} onChange={(accountNumber) => setDraft((d) => ({ ...d, accountNumber }))} /><Field label="CCI (opcional)" value={draft.cci} onChange={(cci) => setDraft((d) => ({ ...d, cci }))} /></> : null}
          <Field label="Titular (opcional)" value={draft.accountHolder} onChange={(accountHolder) => setDraft((d) => ({ ...d, accountHolder }))} />
          <Field label="Observación / referencia (opcional)" value={draft.paymentNote} onChange={(paymentNote) => setDraft((d) => ({ ...d, paymentNote }))} />
          <div className="grid grid-cols-2 gap-3"><Field label="Orden" value={String(draft.sortOrder ?? 0)} onChange={(sortOrder) => setDraft((d) => ({ ...d, sortOrder: Number(sortOrder) || 0 }))} /><label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={draft.isActive ?? true} onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))} /> Activo</label></div>
          {message ? <p className="text-xs text-indigo-700">{message}</p> : null}
          <button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save size={15} /> {busy ? 'Guardando…' : 'Guardar'}</button>
        </form>
      ) : message ? <p className="text-xs font-medium text-emerald-700">{message}</p> : null}
    </div>
  );
};

export default PaymentAccountsSettings;
