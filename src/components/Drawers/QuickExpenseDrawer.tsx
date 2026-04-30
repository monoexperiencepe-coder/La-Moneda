import React, { useState, useEffect, useRef } from 'react';
import { Zap, ListFilter } from 'lucide-react';
import DrawerBase from './DrawerBase';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import {
  TIPOS_GASTO_FACT,
  getSubtiposGasto,
  getDetallesMetodoPago,
  getDetalleMetodoByLabel,
  METODOS_PAGO,
} from '../../data/factCatalog';
import { inferCategoriaFromTipoGasto } from '../../utils/factMappers';
import { todayStr, formatCurrency } from '../../utils/formatting';
import MetodoCuentaPicker from '../Common/MetodoCuentaPicker';
import { parseQuickEntry, previewParsed } from '../../utils/parseQuickEntry';

const QuickExpenseDrawer: React.FC = () => {
  const { openDrawer, close, lastVehicleId, setLastVehicleId } = useDrawer();
  const { vehicles, gastos, addGasto } = useRegistrosContext();
  const isOpen = openDrawer === 'expense';

  const t0 = TIPOS_GASTO_FACT[0] ?? '';
  const firstYape = getDetallesMetodoPago('Yape')[0];

  const [quickMode, setQuickMode] = useState(true);
  const [quickText, setQuickText] = useState('');
  const quickInputRef = useRef<HTMLInputElement>(null);

  const [fechaMov, setFechaMov] = useState(todayStr());
  const [vehicleId, setVehicleId] = useState('');
  const [tipo, setTipo] = useState(t0);
  const [subTipo, setSubTipo] = useState(() => getSubtiposGasto(t0)[0] ?? '');
  const [metodoPago, setMetodoPago] = useState('Yape');
  const [metodoPagoDetalle, setMetodoPagoDetalle] = useState(firstYape?.detalle ?? '');
  const [monto, setMonto] = useState('');
  const [pagadoA, setPagadoA] = useState('');
  const [comentarios, setComentarios] = useState('');
  const [loading, setLoading] = useState(false);
  const montoRef = useRef<HTMLInputElement>(null);

  const subtipos = getSubtiposGasto(tipo);

  useEffect(() => {
    if (isOpen) {
      const first = TIPOS_GASTO_FACT[0] ?? '';
      const y0 = getDetallesMetodoPago('Yape')[0];
      setQuickMode(true);
      setQuickText('');
      setFechaMov(todayStr());
      setVehicleId(lastVehicleId ? String(lastVehicleId) : (vehicles[0] ? String(vehicles[0].id) : ''));
      setTipo(first);
      setSubTipo(getSubtiposGasto(first)[0] ?? '');
      setMetodoPago('Yape');
      setMetodoPagoDetalle(y0?.detalle ?? '');
      setMonto('');
      setPagadoA('');
      setComentarios('');
      setTimeout(() => quickInputRef.current?.focus(), 350);
    }
  }, [isOpen]);

  useEffect(() => {
    const subs = getSubtiposGasto(tipo);
    setSubTipo(subs[0] ?? '');
  }, [tipo]);

  const activeVehicles = vehicles.filter(v => v.activo);

  /* ── Modo rápido ── */
  const parsed = parseQuickEntry(quickText, 'gasto', vehicles);
  const parsedPreview = previewParsed(parsed, vehicles);
  const quickValid =
    parsed.monto != null &&
    parsed.monto > 0 &&
    parsed.tipo != null;

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickValid) return;
    setLoading(true);
    try {
      const resolvedTipo = parsed.tipo!;
      const resolvedSubTipo = parsed.subTipo ?? (getSubtiposGasto(resolvedTipo)[0] ?? null);
      const resolvedMetodo = parsed.metodoPago ?? 'Yape';
      const firstDetail = getDetallesMetodoPago(resolvedMetodo)[0];
      const resolvedDetalle = firstDetail?.detalle ?? '';
      const rawM = Math.round((parsed.monto ?? 0) * 100) / 100;
      const saved = await addGasto({
        fecha: fechaMov,
        fechaRegistro: todayStr(),
        vehicleId: parsed.vehicleId,
        tipo: resolvedTipo,
        subTipo: resolvedSubTipo,
        fechaDesde: null,
        fechaHasta: null,
        metodoPago: resolvedMetodo,
        metodoPagoDetalle: resolvedDetalle,
        celularMetodo: firstDetail?.celular?.trim() || null,
        categoria: inferCategoriaFromTipoGasto(resolvedTipo),
        motivo: resolvedSubTipo ?? resolvedTipo,
        signo: '-',
        monto: rawM,
        pagadoA: '',
        comentarios: parsed.restantes,
      });
      if (!saved) return;
      if (parsed.vehicleId) setLastVehicleId(parsed.vehicleId);
      setQuickText('');
      quickInputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const gastosMismaFecha = gastos
    .filter(g => g.fecha === fechaMov)
    .reduce((s, g) => s + g.monto, 0);
  const newTotal = gastosMismaFecha + (Number(monto) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (subtipos.length > 0 && !subTipo) return;
    if (!monto || Number(monto) <= 0 || !metodoPagoDetalle.trim()) return;
    if (Number.isNaN(Number(monto))) return;
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 350));
      const row = getDetalleMetodoByLabel(metodoPago, metodoPagoDetalle);
      const sub = subTipo || null;
      const rawM = Number(Number(monto).toFixed(2));
      const saved = await addGasto({
        fecha: fechaMov,
        fechaRegistro: todayStr(),
        vehicleId: vehicleId ? Number(vehicleId) : null,
        tipo,
        subTipo: sub,
        fechaDesde: null,
        fechaHasta: null,
        metodoPago,
        metodoPagoDetalle: metodoPagoDetalle.trim(),
        celularMetodo: row?.celular?.trim() ? row.celular.trim() : null,
        categoria: inferCategoriaFromTipoGasto(tipo),
        motivo: sub ?? tipo,
        signo: '-',
        monto: rawM,
        pagadoA: pagadoA.trim(),
        comentarios,
      });
      if (!saved) return;
      if (vehicleId) setLastVehicleId(Number(vehicleId));
      close();
    } finally {
      setLoading(false);
    }
  };

  return (
    <DrawerBase
      isOpen={isOpen}
      onClose={close}
      title="Registrar Gasto"
      subtitle={quickMode ? 'Modo rápido — escribe y presiona Enter' : 'Movimiento, método y cuenta'}
      icon="💸"
      accentColor="from-red-500 to-orange-500"
      footer={
        quickMode ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Total en fecha movimiento</span>
              <span className="font-bold text-red-500 text-lg">{formatCurrency(newTotal)}</span>
            </div>
            <div className="flex gap-3">
              <button onClick={close} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button
                type="submit"
                form="quick-expense-form"
                disabled={!quickValid || loading}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-white text-sm font-bold shadow-md hover:shadow-lg disabled:opacity-50 transition-all"
              >
                {loading ? '...' : '⚡ GUARDAR'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Total en fecha movimiento</span>
              <span className="font-bold text-red-500 text-lg">{formatCurrency(newTotal)}</span>
            </div>
            <p className="text-[10px] text-gray-400 text-center">
              Gastos con fecha de movimiento = {fechaMov}
            </p>
            <div className="flex gap-3">
              <button onClick={close} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSubmit as React.MouseEventHandler}
                disabled={
                  (subtipos.length > 0 && !subTipo)
                  || !monto
                  || Number(monto) <= 0
                  || !metodoPagoDetalle.trim()
                  || loading
                }
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-white text-sm font-bold shadow-md hover:shadow-lg disabled:opacity-50 transition-all"
              >
                {loading ? '...' : '✅ GUARDAR'}
              </button>
            </div>
          </div>
        )
      }
    >
      {/* ── Toggle de modo ── */}
      <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm font-semibold">
        <button
          type="button"
          onClick={() => { setQuickMode(true); setTimeout(() => quickInputRef.current?.focus(), 100); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${quickMode ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <Zap size={14} /> Rápido
        </button>
        <button
          type="button"
          onClick={() => { setQuickMode(false); setTimeout(() => montoRef.current?.focus(), 100); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${!quickMode ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <ListFilter size={14} /> Detallado
        </button>
      </div>

      {/* ── Fecha siempre visible ── */}
      <div>
        <label className="label">Fecha de movimiento</label>
        <input
          type="date"
          value={fechaMov}
          onChange={e => setFechaMov(e.target.value)}
          className="input-field"
        />
      </div>

      {quickMode ? (
        <form id="quick-expense-form" onSubmit={handleQuickSubmit} className="space-y-3">
          <div>
            <label className="label">
              Entrada rápida
              <span className="text-gray-400 font-normal ml-1">"gasolina 30 carro 5"</span>
            </label>
            <input
              ref={quickInputRef}
              type="text"
              value={quickText}
              onChange={e => setQuickText(e.target.value)}
              placeholder="tipo monto carro N  —  ej: gasolina 30 carro 5"
              className="input-field text-base font-medium"
              autoComplete="off"
              autoCapitalize="none"
            />
          </div>

          {quickText.trim() && (
            <div className={`rounded-xl px-4 py-3 text-sm border ${quickValid ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className={`font-semibold ${quickValid ? 'text-red-700' : 'text-amber-700'}`}>
                {quickValid ? '✓ Detectado' : '⚠ Faltan datos'}
              </p>
              <p className="text-gray-700 mt-0.5">{parsedPreview}</p>
              {!quickValid && (
                <ul className="text-xs text-amber-600 mt-1 space-y-0.5 list-disc list-inside">
                  {parsed.monto == null && <li>monto (ej: 30)</li>}
                  {parsed.tipo == null && <li>tipo (ej: gasolina, soat, mecánico)</li>}
                </ul>
              )}
            </div>
          )}

          {/* Chips de vehículos */}
          <div>
            <p className="label mb-1">Vehículo <span className="text-gray-400 font-normal">(opcional)</span></p>
            <div className="flex flex-wrap gap-2">
              {activeVehicles.slice(0, 12).map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setQuickText(t => {
                    const stripped = t.replace(/\b(carro|auto|vehiculo)\s+\d+/gi, '').replace(/#\d+/g, '').trim();
                    return `${stripped} carro ${v.id}`.trim();
                  })}
                  className={`px-3 py-1 rounded-lg border text-xs font-semibold transition-all ${parsed.vehicleId === v.id ? 'bg-red-500 border-red-500 text-white' : 'border-gray-200 text-gray-600 hover:border-red-300'}`}
                >
                  #{v.id} {v.marca}
                </button>
              ))}
            </div>
          </div>

          {/* Chips de tipo gasto — top 8 */}
          <div>
            <p className="label mb-1">Tipo</p>
            <div className="flex flex-wrap gap-2">
              {TIPOS_GASTO_FACT.slice(0, 8).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setQuickText(txt => {
                    const base = txt.replace(new RegExp(`\\b${t.toLowerCase()}\\b`, 'gi'), '').trim();
                    return `${base} ${t.toLowerCase()}`.trim();
                  })}
                  className={`px-3 py-1 rounded-lg border text-xs font-semibold transition-all ${parsed.tipo === t ? 'bg-red-500 border-red-500 text-white' : 'border-gray-200 text-gray-600 hover:border-red-300'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-[11px] text-gray-500 -mt-2">
          Fecha de registro: <strong>automática</strong> al guardar ({todayStr()})
        </p>

        <div>
          <label className="label">Vehículo <span className="text-gray-400 font-normal">(opcional)</span></label>
          <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="input-field appearance-none">
            <option value="">General / Sin vehículo</option>
            {activeVehicles.map(v => (
              <option key={v.id} value={v.id}>#{v.id} — {v.marca} {v.modelo} ({v.placa})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Tipo (Fact)</label>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            className="input-field appearance-none text-sm max-h-40"
          >
            {TIPOS_GASTO_FACT.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {subtipos.length > 0 && (
          <div>
            <label className="label">Sub tipo</label>
            <select
              value={subTipo}
              onChange={e => setSubTipo(e.target.value)}
              className="input-field appearance-none text-sm"
            >
              {subtipos.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        <div className="pt-2 mt-1 border-t border-gray-100 space-y-2">
          <label className="label">Comentarios <span className="text-gray-400 font-normal">(opcional)</span></label>
          <input
            type="text"
            value={comentarios}
            onChange={e => setComentarios(e.target.value)}
            placeholder="Detalle del ítem, factura, referencia…"
            className="input-field"
          />
        </div>

        <p className="text-xs text-gray-500">
          KPI: {inferCategoriaFromTipoGasto(tipo).replace(/_/g, ' ')}
        </p>

        <MetodoCuentaPicker
          metodosChips={METODOS_PAGO}
          metodoPago={metodoPago}
          metodoPagoDetalle={metodoPagoDetalle}
          registrosForCount={gastos}
          theme="rose"
          conteoEtiqueta="gastos"
          onChange={({ metodoPago: m, metodoPagoDetalle: d }) => {
            setMetodoPago(m);
            setMetodoPagoDetalle(d);
          }}
        />

        <div>
          <label className="label">Monto (S/)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg">S/</span>
            <input
              ref={montoRef}
              type="number"
              min="0"
              step="0.01"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="0.00"
              className="input-field pl-12 text-2xl font-bold text-gray-900 py-4"
            />
          </div>
        </div>

        <div>
          <label className="label">Pagado a</label>
          <input
            type="text"
            value={pagadoA}
            onChange={e => setPagadoA(e.target.value)}
            placeholder="¿A quién le pagas? (taller, persona…)"
            className="input-field"
          />
          <p className="text-[11px] text-gray-500 mt-1">Quién recibe el dinero; distinto de la cuenta Yape/Plin de salida.</p>
        </div>
        </form>
      )}
    </DrawerBase>
  );
};

export default QuickExpenseDrawer;
