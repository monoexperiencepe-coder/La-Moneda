import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { useRegistrosContext } from '../../context/RegistrosContext';
import PrestamoForm from '../../components/Forms/PrestamoForm';
import { formatCurrency, formatDate, formatUSD, todayStr } from '../../utils/formatting';
import { prestamoSaldoEquivalentePEN } from '../../utils/moneda';
import type { Moneda } from '../../data/types';

const Prestamos: React.FC = () => {
  const navigate = useNavigate();
  const {
    prestamos,
    prestamoAbonos,
    vehicles,
    addPrestamo,
    addPrestamoAbono,
    deletePrestamo,
    getVehicleLabel,
  } = useRegistrosContext();

  const [abonoPrestamoId, setAbonoPrestamoId] = useState('');
  const [abonoFecha, setAbonoFecha] = useState(todayStr());
  const [abonoMonto, setAbonoMonto] = useState('');
  const [abonoComentarios, setAbonoComentarios] = useState('');
  const [abonoErr, setAbonoErr] = useState('');

  const activos = useMemo(() => prestamos.filter(p => p.estado === 'ACTIVO'), [prestamos]);
  const totalSaldoRefPEN = useMemo(
    () => activos.reduce((s, p) => s + prestamoSaldoEquivalentePEN(p), 0),
    [activos],
  );

  const selectedLoan = prestamos.find(p => p.id === Number(abonoPrestamoId));

  const handleAbono = (e: React.FormEvent) => {
    e.preventDefault();
    setAbonoErr('');
    const pid = Number(abonoPrestamoId);
    const p = prestamos.find(x => x.id === pid);
    if (!p || p.estado !== 'ACTIVO') {
      setAbonoErr('Selecciona un préstamo activo.');
      return;
    }
    const m = Number(abonoMonto);
    if (!abonoMonto.trim() || Number.isNaN(m) || m <= 0) {
      setAbonoErr('Monto inválido.');
      return;
    }
    if (m > p.saldoPendiente + 0.01) {
      setAbonoErr(`El abono no puede superar el saldo (${p.moneda === 'USD' ? 'US$' : 'S/'} ${p.saldoPendiente.toFixed(2)}).`);
      return;
    }
    const res = addPrestamoAbono({
      prestamoId: pid,
      fecha: abonoFecha,
      fechaRegistro: todayStr(),
      moneda: p.moneda,
      monto: m,
      tipoCambio: p.moneda === 'USD' ? p.tipoCambio : null,
      comentarios: abonoComentarios.trim(),
    });
    if (res) {
      setAbonoMonto('');
      setAbonoComentarios('');
    }
  };

  const fmtCapital = (moneda: Moneda, monto: number) =>
    moneda === 'USD' ? formatUSD(monto) : formatCurrency(monto);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/finanzas')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏦 Préstamos</h1>
          <p className="text-sm text-gray-500">Solicitudes en PEN o USD, tasa % anual, TC y abonos a capital</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4">
          <p className="text-xs text-sky-800 font-medium mb-1">Préstamos activos</p>
          <p className="text-2xl font-bold text-sky-900">{activos.length}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-soft sm:col-span-2">
          <p className="text-xs text-gray-500 font-medium mb-1">Saldo pendiente (referencia aprox. en soles)</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalSaldoRefPEN)}</p>
          <p className="text-[11px] text-gray-400 mt-1">USD × TC guardado en cada préstamo. Para precision contable usa el mismo TC que tu cierre.</p>
        </div>
      </div>

      <PrestamoForm vehicles={vehicles} onSubmit={addPrestamo} />

      <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-5">
        <h2 className="text-base font-bold text-gray-800 mb-3">Abono a capital</h2>
        <p className="text-xs text-gray-500 mb-4">Misma moneda que el préstamo. Reduce saldo y puede liquidar el préstamo.</p>
        <form onSubmit={handleAbono} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="label">Préstamo</label>
            <select
              value={abonoPrestamoId}
              onChange={e => setAbonoPrestamoId(e.target.value)}
              className="input-field appearance-none text-sm"
            >
              <option value="">Seleccionar…</option>
              {activos.map(p => (
                <option key={p.id} value={p.id}>
                  #{p.id} {p.acreedor} — saldo {p.moneda === 'USD' ? 'US$' : 'S/'} {p.saldoPendiente.toFixed(2)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Fecha abono</label>
            <input type="date" value={abonoFecha} onChange={e => setAbonoFecha(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="label">Monto abono</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={abonoMonto}
              onChange={e => setAbonoMonto(e.target.value)}
              className="input-field"
              placeholder={selectedLoan ? `Máx. ${selectedLoan.saldoPendiente.toFixed(2)}` : '0.00'}
            />
          </div>
          <button
            type="submit"
            className="py-2.5 px-4 rounded-xl bg-sky-600 text-white text-sm font-bold hover:bg-sky-700 transition-colors"
          >
            Registrar abono
          </button>
        </form>
        {abonoErr && <p className="text-xs text-red-600 mt-2">{abonoErr}</p>}
        <input
          type="text"
          value={abonoComentarios}
          onChange={e => setAbonoComentarios(e.target.value)}
          placeholder="Comentario (opcional)"
          className="input-field mt-3 text-sm"
        />
      </div>

      <div>
        <h2 className="text-base font-bold text-gray-800 mb-3">Cartera</h2>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-semibold">Inicio</th>
                <th className="px-4 py-3 font-semibold">Acreedor</th>
                <th className="px-4 py-3 font-semibold">Vehículo</th>
                <th className="px-4 py-3 font-semibold">Capital</th>
                <th className="px-4 py-3 font-semibold">Tasa %</th>
                <th className="px-4 py-3 font-semibold">TC</th>
                <th className="px-4 py-3 font-semibold">Saldo</th>
                <th className="px-4 py-3 font-semibold">Ref. S/</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {prestamos.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(p.fecha)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-[10rem] truncate" title={p.acreedor}>{p.acreedor}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs truncate max-w-[8rem]">{getVehicleLabel(p.vehicleId)}</td>
                  <td className="px-4 py-3">{fmtCapital(p.moneda, p.monto)}</td>
                  <td className="px-4 py-3">{p.tasaInteresAnualPct.toFixed(2)}%</td>
                  <td className="px-4 py-3 text-gray-600">{p.tipoCambio != null ? p.tipoCambio.toFixed(4) : '—'}</td>
                  <td className="px-4 py-3 font-semibold text-sky-800">{fmtCapital(p.moneda, p.saldoPendiente)}</td>
                  <td className="px-4 py-3 text-gray-700">{formatCurrency(prestamoSaldoEquivalentePEN(p))}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${p.estado === 'ACTIVO' ? 'bg-emerald-100 text-emerald-800' : p.estado === 'LIQUIDADO' ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-800'}`}>
                      {p.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => deletePrestamo(p.id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
                      aria-label="Eliminar préstamo"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {prestamos.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">Sin préstamos</p>}
        </div>
      </div>

      <div>
        <h2 className="text-base font-bold text-gray-800 mb-3">Historial de abonos</h2>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-semibold">Fecha</th>
                <th className="px-4 py-3 font-semibold">Préstamo #</th>
                <th className="px-4 py-3 font-semibold">Monto</th>
                <th className="px-4 py-3 font-semibold">Comentarios</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...prestamoAbonos].sort((a, b) => b.fecha.localeCompare(a.fecha)).map(a => (
                <tr key={a.id}>
                  <td className="px-4 py-3">{formatDate(a.fecha)}</td>
                  <td className="px-4 py-3">#{a.prestamoId}</td>
                  <td className="px-4 py-3 font-medium">{a.moneda === 'USD' ? formatUSD(a.monto) : formatCurrency(a.monto)}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{a.comentarios || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {prestamoAbonos.length === 0 && <p className="text-center py-6 text-gray-400 text-sm">Sin abonos</p>}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        <strong>Ingresos relacionados:</strong> registra aportes y devoluciones de préstamo en{' '}
        <button type="button" className="text-primary-600 font-semibold hover:underline" onClick={() => navigate('/finanzas/ingresos')}>
          Ingresos
        </button>
        {' '}con tipo <strong>APORTES</strong> o <strong>DEVOLUCION PRESTAMO</strong>, moneda y tipo de cambio para que los KPIs usen el equivalente en soles.
      </p>
    </div>
  );
};

export default Prestamos;
