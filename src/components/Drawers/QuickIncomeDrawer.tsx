import React, { useState, useEffect, useRef } from 'react';
import { CalendarRange, Zap, ListFilter } from 'lucide-react';
import DrawerBase from './DrawerBase';
import { useRegistrosContext } from '../../context/RegistrosContext';
import { useDrawer } from '../../context/DrawerContext';
import { TIPOS_INGRESO } from '../../data/catalogs';
import {
  getSubtiposIngreso,
  getDetallesMetodoPago,
  getDetalleMetodoByLabel,
} from '../../data/factCatalog';
import { todayStr, formatCurrency } from '../../utils/formatting';
import type { Moneda } from '../../data/types';
import { ingresoMontoPEN } from '../../utils/moneda';
import PeriodoPagoModal from '../Ingreso/PeriodoPagoModal';
import PagoRapidoIngreso from '../Ingreso/PagoRapidoIngreso';
import { parseQuickEntry, previewParsed } from '../../utils/parseQuickEntry';

const QuickIncomeDrawer: React.FC = () => {
  const { openDrawer, close, lastVehicleId, setLastVehicleId } = useDrawer();
  const { vehicles, ingresos, addIngreso } = useRegistrosContext();
  const isOpen = openDrawer === 'income';

  const defaultTipo = TIPOS_INGRESO.includes('ALQUILER') ? 'ALQUILER' : (TIPOS_INGRESO[0] ?? 'ALQUILER');
  const firstYape = getDetallesMetodoPago('Yape')[0];

  const [quickMode, setQuickMode] = useState(true);
  const [quickText, setQuickText] = useState('');
  const quickInputRef = useRef<HTMLInputElement>(null);

  const [fechaMov, setFechaMov] = useState(todayStr());
  const [vehicleId, setVehicleId] = useState('');
  const [tipo, setTipo] = useState(defaultTipo);
  const [subTipo, setSubTipo] = useState(() => getSubtiposIngreso(defaultTipo)[0] ?? '');
  const [metodoPago, setMetodoPago] = useState('Yape');
  const [metodoPagoDetalle, setMetodoPagoDetalle] = useState(firstYape?.detalle ?? '');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [periodoOpen, setPeriodoOpen] = useState(false);
  const [moneda, setMoneda] = useState<Moneda>('PEN');
  const [tipoCambio, setTipoCambio] = useState('');
  const [monto, setMonto] = useState('');
  const [comentarios, setComentarios] = useState('');
  const [loading, setLoading] = useState(false);
  const montoRef = useRef<HTMLInputElement>(null);

  const subtipos = getSubtiposIngreso(tipo);

  useEffect(() => {
    if (isOpen) {
      const t0 = TIPOS_INGRESO.includes('ALQUILER') ? 'ALQUILER' : (TIPOS_INGRESO[0] ?? 'ALQUILER');
      const y0 = getDetallesMetodoPago('Yape')[0];
      setQuickMode(true);
      setQuickText('');
      setFechaMov(todayStr());
      setVehicleId(lastVehicleId ? String(lastVehicleId) : (vehicles[0] ? String(vehicles[0].id) : ''));
      setTipo(t0);
      setSubTipo(getSubtiposIngreso(t0)[0] ?? '');
      setMetodoPago('Yape');
      setMetodoPagoDetalle(y0?.detalle ?? '');
      setFechaDesde('');
      setFechaHasta('');
      setMoneda('PEN');
      setTipoCambio('');
      setMonto('');
      setComentarios('');
      setTimeout(() => {
        if (quickMode) quickInputRef.current?.focus();
        else montoRef.current?.focus();
      }, 350);
    }
  }, [isOpen]);

  useEffect(() => {
    const subs = getSubtiposIngreso(tipo);
    setSubTipo(subs[0] ?? '');
  }, [tipo]);

  const activeVehicles = vehicles.filter(v => v.activo);

  /* ── Modo rápido: parsear texto en tiempo real ── */
  const parsed = parseQuickEntry(quickText, 'ingreso', vehicles);
  const parsedPreview = previewParsed(parsed, vehicles);
  const quickValid =
    parsed.monto != null &&
    parsed.monto > 0 &&
    parsed.tipo != null &&
    parsed.vehicleId != null;

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickValid) return;
    setLoading(true);
    try {
      const resolvedVehicleId = parsed.vehicleId!;
      const resolvedTipo = parsed.tipo!;
      const resolvedSubTipo = parsed.subTipo ?? (getSubtiposIngreso(resolvedTipo)[0] ?? null);
      const resolvedMetodo = parsed.metodoPago ?? 'Yape';
      const firstDetail = getDetallesMetodoPago(resolvedMetodo)[0];
      const resolvedDetalle = firstDetail?.detalle ?? '';
      const rawM = Math.round((parsed.monto ?? 0) * 100) / 100;
      const saved = await addIngreso({
        fecha: fechaMov,
        fechaRegistro: todayStr(),
        vehicleId: resolvedVehicleId,
        tipo: resolvedTipo,
        subTipo: resolvedSubTipo,
        fechaDesde: null,
        fechaHasta: null,
        metodoPago: resolvedMetodo,
        metodoPagoDetalle: resolvedDetalle,
        celularMetodo: firstDetail?.celular?.trim() || null,
        signo: '+',
        monto: rawM,
        moneda: 'PEN',
        tipoCambio: null,
        montoPENReferencia: rawM,
        comentarios: parsed.restantes,
      });
      if (!saved) return;
      setLastVehicleId(resolvedVehicleId);
      setQuickText('');
      quickInputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const todayIngresos = ingresos
    .filter(i => i.fecha === fechaMov)
    .reduce((s, i) => s + ingresoMontoPEN(i), 0);
  const draft = Number(monto) || 0;
  const previewPEN =
    moneda === 'USD'
      ? (Number(tipoCambio) > 0 ? draft * Number(tipoCambio) : 0)
      : draft;
  const newTotal = todayIngresos + previewPEN;

  const periodoLabel =
    fechaDesde && fechaHasta
      ? `${fechaDesde} → ${fechaHasta}`
      : fechaDesde || fechaHasta
        ? `${fechaDesde || '…'} → ${fechaHasta || '…'}`
        : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId || !monto || Number(monto) <= 0 || !metodoPagoDetalle.trim()) return;
    if (moneda === 'USD' && (!tipoCambio.trim() || Number(tipoCambio) <= 0)) return;
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 350));
      const row = getDetalleMetodoByLabel(metodoPago, metodoPagoDetalle);
      const rawM = Number(Number(monto).toFixed(2));
      const tc =
        moneda === 'USD'
          ? Number(Number(tipoCambio).toFixed(4))
          : tipoCambio.trim()
            ? Number(Number(tipoCambio).toFixed(4))
            : null;
      const montoPENReferencia =
        moneda === 'USD' && tc != null && tc > 0
          ? Number((rawM * tc).toFixed(2))
          : rawM;
      const saved = await addIngreso({
        fecha: fechaMov,
        fechaRegistro: todayStr(),
        vehicleId: Number(vehicleId),
        tipo,
        subTipo: subTipo || null,
        fechaDesde: fechaDesde.trim() || null,
        fechaHasta: fechaHasta.trim() || null,
        metodoPago,
        metodoPagoDetalle: metodoPagoDetalle.trim(),
        celularMetodo: row?.celular?.trim() ? row.celular.trim() : null,
        signo: '+',
        monto: rawM,
        moneda,
        tipoCambio: tc,
        montoPENReferencia,
        comentarios,
      });
      if (!saved) return;
      setLastVehicleId(Number(vehicleId));
      close();
    } finally {
      setLoading(false);
    }
  };

  return (
    <DrawerBase
      isOpen={isOpen}
      onClose={close}
      title="Registrar Ingreso"
      subtitle={quickMode ? 'Modo rápido — escribe y presiona Enter' : 'Movimiento, período y cuenta'}
      icon="💰"
      accentColor="from-emerald-500 to-teal-600"
      footer={
        quickMode ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Total ref. S/ en fecha mov.</span>
              <span className="font-bold text-emerald-600 text-lg">{formatCurrency(newTotal)}</span>
            </div>
            <div className="flex gap-3">
              <button onClick={close} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button
                type="submit"
                form="quick-income-form"
                disabled={!quickValid || loading}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-bold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? '...' : '⚡ GUARDAR'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Total ref. S/ en fecha mov.</span>
              <span className="font-bold text-emerald-600 text-lg">{formatCurrency(newTotal)}</span>
            </div>
            <p className="text-[10px] text-gray-400 text-center">
              Incluye USD × tipo de cambio indicado. Fecha = {fechaMov}
            </p>
            <div className="flex gap-3">
              <button onClick={close} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSubmit as React.MouseEventHandler}
                disabled={
                  !vehicleId ||
                  !monto ||
                  Number(monto) <= 0 ||
                  !metodoPagoDetalle.trim() ||
                  loading ||
                  (moneda === 'USD' && (!tipoCambio.trim() || Number(tipoCambio) <= 0))
                }
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-bold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${quickMode ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <Zap size={14} /> Rápido
        </button>
        <button
          type="button"
          onClick={() => { setQuickMode(false); setTimeout(() => montoRef.current?.focus(), 100); }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 transition-colors ${!quickMode ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
        >
          <ListFilter size={14} /> Detallado
        </button>
      </div>

      {/* ── Fecha siempre visible ── */}
      <div>
        <label className="label">Fecha de movimiento</label>
        <input type="date" value={fechaMov} onChange={e => setFechaMov(e.target.value)} className="input-field" />
      </div>

      {quickMode ? (
        <form id="quick-income-form" onSubmit={handleQuickSubmit} className="space-y-3">
          <div>
            <label className="label">
              Entrada rápida
              <span className="text-gray-400 font-normal ml-1">"50 alquiler carro 3"</span>
            </label>
            <input
              ref={quickInputRef}
              type="text"
              value={quickText}
              onChange={e => setQuickText(e.target.value)}
              placeholder="monto tipo carro N  —  ej: 50 alquiler carro 3"
              className="input-field text-base font-medium"
              autoComplete="off"
              autoCapitalize="none"
            />
          </div>

          {/* Vista previa de detección */}
          {quickText.trim() && (
            <div className={`rounded-xl px-4 py-3 text-sm border ${quickValid ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className={`font-semibold ${quickValid ? 'text-emerald-700' : 'text-amber-700'}`}>
                {quickValid ? '✓ Detectado' : '⚠ Faltan datos'}
              </p>
              <p className="text-gray-700 mt-0.5">{parsedPreview}</p>
              {!quickValid && (
                <ul className="text-xs text-amber-600 mt-1 space-y-0.5 list-disc list-inside">
                  {parsed.monto == null && <li>monto (ej: 50)</li>}
                  {parsed.tipo == null && <li>tipo (ej: alquiler)</li>}
                  {parsed.vehicleId == null && <li>vehículo (ej: carro 3)</li>}
                </ul>
              )}
            </div>
          )}

          {/* Chips de vehículos activos */}
          <div>
            <p className="label mb-1">Vehículo rápido</p>
            <div className="flex flex-wrap gap-2">
              {activeVehicles.slice(0, 12).map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setQuickText(t => {
                    const stripped = t.replace(/\b(carro|auto|vehiculo)\s+\d+/gi, '').replace(/#\d+/g, '').trim();
                    return `${stripped} carro ${v.id}`.trim();
                  })}
                  className={`px-3 py-1 rounded-lg border text-xs font-semibold transition-all ${parsed.vehicleId === v.id ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-200 text-gray-600 hover:border-emerald-300'}`}
                >
                  #{v.id} {v.marca}
                </button>
              ))}
            </div>
          </div>

          {/* Chips de tipo */}
          <div>
            <p className="label mb-1">Tipo</p>
            <div className="flex flex-wrap gap-2">
              {TIPOS_INGRESO.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setQuickText(txt => {
                    const base = txt.replace(new RegExp(`\\b${t.toLowerCase()}\\b`, 'gi'), '').trim();
                    return `${base} ${t.toLowerCase()}`.trim();
                  })}
                  className={`px-3 py-1 rounded-lg border text-xs font-semibold transition-all ${parsed.tipo === t ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-200 text-gray-600 hover:border-emerald-300'}`}
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

        <button
          type="button"
          onClick={() => setPeriodoOpen(true)}
          className="flex items-center gap-2 w-full py-2.5 px-3 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-700 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors"
        >
          <CalendarRange size={18} className="text-emerald-600 shrink-0" />
          <span className="truncate text-left">
            {periodoLabel ? `Período del pago: ${periodoLabel}` : 'Período del pago (opcional)'}
          </span>
        </button>

        <PeriodoPagoModal
          isOpen={periodoOpen}
          onClose={() => setPeriodoOpen(false)}
          fechaDesde={fechaDesde}
          fechaHasta={fechaHasta}
          onGuardar={(desde, hasta) => {
            setFechaDesde(desde);
            setFechaHasta(hasta);
          }}
        />

        <div>
          <label className="label">Vehículo</label>
          <select
            value={vehicleId}
            onChange={e => setVehicleId(e.target.value)}
            className="input-field appearance-none"
          >
            <option value="">Seleccionar...</option>
            {activeVehicles.map(v => (
              <option key={v.id} value={v.id}>#{v.id} — {v.marca} {v.modelo} ({v.placa})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Tipo de ingreso (Fact)</label>
          <div className="grid grid-cols-2 gap-2">
            {TIPOS_INGRESO.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border-2 transition-all text-left
                  ${tipo === t
                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-md'
                    : 'border-gray-200 text-gray-600 hover:border-emerald-300'}`}
              >
                {t}
              </button>
            ))}
          </div>
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

        <PagoRapidoIngreso
          metodoPago={metodoPago}
          metodoPagoDetalle={metodoPagoDetalle}
          ingresos={ingresos}
          onChange={({ metodoPago: m, metodoPagoDetalle: d }) => {
            setMetodoPago(m);
            setMetodoPagoDetalle(d);
          }}
        />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Moneda</label>
            <select
              value={moneda}
              onChange={e => {
                const v = e.target.value as Moneda;
                setMoneda(v);
                if (v === 'PEN') setTipoCambio('');
              }}
              className="input-field appearance-none text-sm"
            >
              <option value="PEN">PEN</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className="label">TC (S/ × US$)</label>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={tipoCambio}
              onChange={e => setTipoCambio(e.target.value)}
              placeholder={moneda === 'USD' ? 'Oblig.' : 'Opc.'}
              className="input-field text-sm"
            />
          </div>
        </div>

        <div>
          <label className="label">{moneda === 'USD' ? 'Monto (US$)' : 'Monto (S/)'}</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-lg">
              {moneda === 'USD' ? 'US$' : 'S/'}
            </span>
            <input
              ref={montoRef}
              type="number"
              min="0"
              step="0.01"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="0.00"
              className="input-field pl-14 text-2xl font-bold text-gray-900 py-4"
            />
          </div>
        </div>

        <div>
          <label className="label">Comentarios <span className="text-gray-400 font-normal">(opcional)</span></label>
          <input
            type="text"
            value={comentarios}
            onChange={e => setComentarios(e.target.value)}
            placeholder="Observaciones..."
            className="input-field"
          />
        </div>
        </form>
      )}
    </DrawerBase>
  );
};

export default QuickIncomeDrawer;
