import { useAmountDisplay } from '../../hooks/useAmountDisplay';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCopilotNarrativeNavigation } from '../../hooks/useCopilotNarrativeNavigation';
import { ChevronDown, ChevronUp, ChevronsUpDown, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  fetchInversionesGeneralesVehiculo,
  deleteInversionGeneralVehiculo,
} from '../../services/inversionesGeneralesVehiculoService';
import type { InversionGeneralVehiculo, Moneda } from '../../data/types';
import { EMPRESA_ID } from '../../config/app';
import { useAuth } from '../../context/AuthContext';
import { canMutateInversiones, canUseInversiones, permissionUserFromAuth } from '../../utils/permissions';
import { sumInversionGeneralesByMoneda } from '../../utils/vehicleInversionDisplay';
import InversionGeneralVehiculoModal from '../../components/Finanzas/InversionGeneralVehiculoModal';

function montoFmt(
  amount: number,
  moneda: Moneda,
  formatGlobalAmount: (n: number, c?: 'PEN' | 'USD') => string,
): string {
  return moneda === 'USD' ? formatGlobalAmount(amount, 'USD') : formatGlobalAmount(amount);
}

function fmtUsdCell(v: number | null | undefined, formatGlobalAmount: (n: number, c?: 'PEN' | 'USD') => string): string {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return formatGlobalAmount(Number(v), 'USD');
}

function fmtPenRef(v: number | null | undefined, formatGlobalAmount: (n: number, c?: 'PEN' | 'USD') => string): string {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return formatGlobalAmount(Number(v));
}

type SortKey = 'numero' | 'referencia' | 'placa' | 'monto' | 'moneda';

function cmpStrEmptyLast(a: string, b: string, mul: 1 | -1): number {
  const ea = !a.trim();
  const eb = !b.trim();
  if (ea && eb) return 0;
  if (ea) return 1;
  if (eb) return -1;
  return mul * a.localeCompare(b, 'es', { sensitivity: 'base' });
}

/** Orden numérico de monto entre monedas distintas es solo orientativo. */
function compareInversionesRow(a: InversionGeneralVehiculo, b: InversionGeneralVehiculo, key: SortKey, mul: 1 | -1): number {
  switch (key) {
    case 'numero': {
      const na = a.vehiculoNumero ?? 10_000;
      const nb = b.vehiculoNumero ?? 10_000;
      if (na !== nb) return mul * (na - nb);
      return mul * a.vehiculoReferencia.localeCompare(b.vehiculoReferencia, 'es', { sensitivity: 'base' });
    }
    case 'referencia':
      return mul * a.vehiculoReferencia.localeCompare(b.vehiculoReferencia, 'es', { sensitivity: 'base' });
    case 'placa':
      return cmpStrEmptyLast(a.placa ?? '', b.placa ?? '', mul);
    case 'monto': {
      const d = a.montoTotal - b.montoTotal;
      if (d !== 0) return mul * d;
      const mc = a.moneda.localeCompare(b.moneda);
      if (mc !== 0) return mc;
      return a.vehiculoReferencia.localeCompare(b.vehiculoReferencia, 'es', { sensitivity: 'base' });
    }
    case 'moneda': {
      const mc = a.moneda.localeCompare(b.moneda);
      if (mc !== 0) return mul * mc;
      return mul * (a.montoTotal - b.montoTotal);
    }
    default:
      return 0;
  }
}

function SortGlyph({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronsUpDown className="inline h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />;
  return dir === 'asc' ? (
    <ChevronUp className="inline h-3.5 w-3.5 shrink-0 text-violet-700" aria-hidden />
  ) : (
    <ChevronDown className="inline h-3.5 w-3.5 shrink-0 text-violet-700" aria-hidden />
  );
}

/** Borde derecho entre columnas (last:* quita borde en la última celda). */
const colSep = 'border-r border-slate-200/90 last:border-r-0';

const thBase = `px-2 py-1.5 text-[10px] sm:text-[11px] font-semibold normal-case tracking-normal text-slate-600 whitespace-nowrap leading-tight ${colSep}`;
const thText = `${thBase} text-left`;
const thUsd = `${thBase} text-right max-w-[4.75rem]`;
const tdBase = `px-2 py-1 text-[10px] sm:text-[11px] tabular-nums text-slate-700 leading-tight ${colSep}`;
const tdText = `${tdBase} text-left`;
const tdUsd = `${tdBase} text-right max-w-[4.75rem]`;

const InversionesGeneralesPanel: React.FC = () => {
  const { formatGlobalAmount, formatRecordAmount } = useAmountDisplay();
  const [searchParams] = useSearchParams();
  const filterPlaca = (searchParams.get('placa') ?? '').trim().toUpperCase();
  const filterVehicleId = (searchParams.get('vehicleId') ?? '').trim();
  const { profile, user } = useAuth();
  const permUser = useMemo(() => permissionUserFromAuth(user, profile?.email ?? null), [user, profile?.email]);
  const canLoadInversiones = useMemo(() => canUseInversiones(permUser), [permUser]);
  const canMutate = useMemo(() => canMutateInversiones(permUser), [permUser]);
  const tenantEmpresaId = profile?.empresa_id;

  const [rows, setRows] = useState<InversionGeneralVehiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey | null; dir: 'asc' | 'desc' }>({ key: 'numero', dir: 'asc' });

  // Estado modal de alta/edición
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<InversionGeneralVehiculo | null>(null);

  // Estado de confirmación de eliminación
  const [deletingRow, setDeletingRow] = useState<InversionGeneralVehiculo | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!canLoadInversiones) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (!tenantEmpresaId?.trim() && !EMPRESA_ID) {
      setRows([]);
      setLoading(false);
      setError('Falta empresa_id en el entorno.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInversionesGeneralesVehiculo(tenantEmpresaId);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canLoadInversiones, tenantEmpresaId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSortHeader = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: key === 'monto' ? 'desc' : 'asc' };
    });
  }, []);

  const displayRows = useMemo(() => {
    let base = rows;
    if (filterPlaca) {
      base = base.filter((r) => (r.placa ?? '').toUpperCase() === filterPlaca);
    }
    if (filterVehicleId) {
      base = base.filter(
        (r) =>
          String(r.vehiculoNumero ?? '') === filterVehicleId
          || r.vehiculoReferencia.toLowerCase().includes(filterVehicleId.toLowerCase()),
      );
    }
    if (!sort.key) return base;
    const arr = [...base];
    const mul: 1 | -1 = sort.dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => compareInversionesRow(a, b, sort.key!, mul));
    return arr;
  }, [rows, sort, filterPlaca, filterVehicleId]);

  const totalesPorMoneda = useMemo(() => sumInversionGeneralesByMoneda(displayRows), [displayRows]);
  const totalesGlobales = useMemo(() => sumInversionGeneralesByMoneda(rows), [rows]);

  const handleOpenCreate = useCallback(() => {
    setEditingRow(null);
    setModalOpen(true);
  }, []);

  const handleOpenEdit = useCallback((row: InversionGeneralVehiculo) => {
    setEditingRow(row);
    setModalOpen(true);
  }, []);

  const handleModalSaved = useCallback(() => {
    void reload();
  }, [reload]);

  const handleRequestDelete = useCallback((row: InversionGeneralVehiculo) => {
    setDeleteError('');
    setDeletingRow(row);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingRow || deleteBusy) return;
    setDeleteError('');
    setDeleteBusy(true);
    try {
      await deleteInversionGeneralVehiculo(deletingRow.id, tenantEmpresaId);
      setDeletingRow(null);
      void reload();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Error al eliminar.');
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, deletingRow, reload, tenantEmpresaId]);

  useCopilotNarrativeNavigation({
    resolveTarget: (step) => {
      const hv = (searchParams.get('highlightVehicle') ?? filterPlaca ?? filterVehicleId ?? '').trim();
      if (hv) {
        const row = document.querySelector(
          `[data-copilot-vehicle="${CSS.escape(hv.toUpperCase())}"], [data-copilot-vehicle-id="${CSS.escape(hv)}"]`,
        ) as HTMLElement | null;
        if (row) return row;
      }
      return (
        document.getElementById(step.target.replace(/^#/, '')) ??
        document.getElementById('copilot-inversiones-table')
      );
    },
  });

  const sortThBtn =
    'inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-violet-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 rounded px-0.5 -mx-0.5';

  if (!EMPRESA_ID) {
    return (
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Define <code className="text-xs bg-white px-1 rounded">VITE_EMPRESA_ID</code> para ver inversiones generales.
      </p>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <InversionGeneralVehiculoModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingRow(null); }}
        existing={editingRow}
        onSaved={handleModalSaved}
      />
      {loading ? (
        <p className="text-sm text-slate-500 py-6">Cargando…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">
          No hay filas en <code className="text-xs bg-slate-100 px-1 rounded">inversiones_generales_vehiculo</code>. Ejecuta la
          migración SQL, el script de import desde Excel (hoja VALOR DE INVERSION) y vuelve a cargar.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800/90">Vehículos con dato</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-violet-950">{rows.length}</p>
            </div>
            <div className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-white p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800/90">Total inversiones (listado)</p>
              <div className="mt-1 space-y-1 text-lg font-bold tabular-nums text-violet-950">
                {totalesPorMoneda.usdSum > 0 ? <p>{montoFmt(totalesPorMoneda.usdSum, 'USD', formatGlobalAmount)}</p> : null}
                {totalesPorMoneda.penSum > 0 ? <p>{montoFmt(totalesPorMoneda.penSum, 'PEN', formatGlobalAmount)}</p> : null}
                {totalesPorMoneda.usdSum <= 0 && totalesPorMoneda.penSum <= 0 ? (
                  <p className="text-slate-500 font-normal text-base">—</p>
                ) : null}
              </div>
              {(filterPlaca || filterVehicleId) && displayRows.length !== rows.length ? (
                <p className="mt-1 text-[10px] text-violet-700/90">
                  {displayRows.length} de {rows.length} filas · global{' '}
                  {totalesGlobales.usdSum > 0 ? montoFmt(totalesGlobales.usdSum, 'USD', formatGlobalAmount) : ''}
                  {totalesGlobales.usdSum > 0 && totalesGlobales.penSum > 0 ? ' · ' : ''}
                  {totalesGlobales.penSum > 0 ? montoFmt(totalesGlobales.penSum, 'PEN', formatGlobalAmount) : ''}
                </p>
              ) : null}
            </div>
          </div>

          {canMutate ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 shadow-sm"
              >
                <Plus size={16} />
                Agregar inversión
              </button>
            </div>
          ) : null}

          {/* Diálogo de confirmación de eliminación */}
          {deletingRow ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-red-900">
                ¿Eliminar el registro de inversión de esta unidad?
              </p>
              <p className="text-sm text-red-800">
                <span className="font-medium">{deletingRow.vehiculoReferencia}</span>
                {deletingRow.placa ? ` — Placa: ${deletingRow.placa}` : ''}
              </p>
              <p className="text-xs text-red-700">
                Se eliminará el registro de inversión. <strong>El vehículo no será eliminado.</strong> Esta acción
                no se puede deshacer.
              </p>
              {deleteError ? (
                <p className="text-xs text-red-600 bg-red-100 rounded px-2 py-1">{deleteError}</p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={deleteBusy}
                  onClick={() => void handleConfirmDelete()}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Sí, eliminar
                </button>
                <button
                  type="button"
                  disabled={deleteBusy}
                  onClick={() => { setDeletingRow(null); setDeleteError(''); }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          <div id="copilot-inversiones-table" className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-[1020px] w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase tracking-wide">
                  <th className={thText} aria-sort={sort.key === 'numero' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className={sortThBtn} onClick={() => handleSortHeader('numero')}>
                      N° <SortGlyph active={sort.key === 'numero'} dir={sort.dir} />
                    </button>
                  </th>
                  <th
                    className={`${thText} min-w-[6.25rem]`}
                    aria-sort={sort.key === 'referencia' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button type="button" className={sortThBtn} onClick={() => handleSortHeader('referencia')}>
                      Unidad <SortGlyph active={sort.key === 'referencia'} dir={sort.dir} />
                    </button>
                  </th>
                  <th className={thText} aria-sort={sort.key === 'placa' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className={sortThBtn} onClick={() => handleSortHeader('placa')}>
                      Placa <SortGlyph active={sort.key === 'placa'} dir={sort.dir} />
                    </button>
                  </th>
                  <th className={`${thText} whitespace-nowrap`}>Compra</th>
                  <th className={thUsd}>Valor veh.</th>
                  <th className={thUsd}>GNV</th>
                  <th className={thUsd}>Notarial</th>
                  <th className={thUsd}>Seguro</th>
                  <th className={thUsd}>GPS</th>
                  <th className={thUsd}>Fundas</th>
                  <th
                    className={`${thUsd} min-w-[5.75rem]`}
                    title="Entre PEN y USD el orden por cifra es orientativo."
                    aria-sort={sort.key === 'monto' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button type="button" className={`${sortThBtn} w-full justify-end`} onClick={() => handleSortHeader('monto')}>
                      Total inv. <SortGlyph active={sort.key === 'monto'} dir={sort.dir} />
                    </button>
                  </th>
                  <th className={`${thUsd} min-w-[5rem]`}>Equiv. S/</th>
                  <th className={thText} aria-sort={sort.key === 'moneda' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className={sortThBtn} onClick={() => handleSortHeader('moneda')}>
                      Mon. <SortGlyph active={sort.key === 'moneda'} dir={sort.dir} />
                    </button>
                  </th>
                  {canMutate ? (
                    <th className={`${thBase} text-center w-20`}>Acciones</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
                    data-copilot-vehicle={r.placa?.toUpperCase() ?? undefined}
                    data-copilot-vehicle-id={r.vehiculoNumero != null ? String(r.vehiculoNumero) : undefined}
                  >
                    <td className={`${tdText} tabular-nums text-slate-600`}>{r.vehiculoNumero ?? '—'}</td>
                    <td className={`${tdText} font-medium text-slate-900`}>{r.vehiculoReferencia}</td>
                    <td className={`${tdText} text-slate-600 whitespace-nowrap`}>{r.placa ?? '—'}</td>
                    <td className={`${tdText} tabular-nums text-slate-600 whitespace-nowrap`}>
                      {r.fechaCompra ? r.fechaCompra.slice(0, 10) : '—'}
                    </td>
                    <td className={tdUsd}>{fmtUsdCell(r.valorCompraUsd, formatGlobalAmount)}</td>
                    <td className={tdUsd}>{fmtUsdCell(r.gastoGnvUsd, formatGlobalAmount)}</td>
                    <td className={tdUsd}>{fmtUsdCell(r.gastoNotarialUsd, formatGlobalAmount)}</td>
                    <td className={tdUsd}>{fmtUsdCell(r.seguroUsd, formatGlobalAmount)}</td>
                    <td className={tdUsd}>{fmtUsdCell(r.gpsUsd, formatGlobalAmount)}</td>
                    <td className={tdUsd}>{fmtUsdCell(r.fundasAccesoriosUsd, formatGlobalAmount)}</td>
                    <td className={`${tdUsd} font-semibold text-slate-900`}>{montoFmt(r.montoTotal, r.moneda, formatGlobalAmount)}</td>
                    <td className={tdUsd}>{fmtPenRef(r.totalInversionPen, formatGlobalAmount)}</td>
                    <td className={`${tdText} text-slate-500`}>{r.moneda}</td>
                    {canMutate ? (
                      <td className={`${tdBase} text-center`}>
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            title="Editar"
                            onClick={() => handleOpenEdit(r)}
                            className="p-1 rounded hover:bg-violet-50 text-violet-600 hover:text-violet-800"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            title="Eliminar"
                            onClick={() => handleRequestDelete(r)}
                            className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-700"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
              {displayRows.length > 0 ? (
                <tfoot>
                  <tr className="border-t-2 border-violet-200 bg-violet-50/80 font-semibold text-violet-950">
                    <td colSpan={10} className={`${tdText} py-2`}>
                      Total inversiones ({displayRows.length} unidad{displayRows.length === 1 ? '' : 'es'})
                    </td>
                    <td className={`${tdUsd} py-2`}>
                      {totalesPorMoneda.usdSum > 0 ? (
                        <span className="block">{montoFmt(totalesPorMoneda.usdSum, 'USD', formatGlobalAmount)}</span>
                      ) : null}
                      {totalesPorMoneda.penSum > 0 ? (
                        <span className="block">{montoFmt(totalesPorMoneda.penSum, 'PEN', formatGlobalAmount)}</span>
                      ) : null}
                      {totalesPorMoneda.usdSum <= 0 && totalesPorMoneda.penSum <= 0 ? '—' : null}
                    </td>
                    <td className={`${tdUsd} py-2`}>
                      {formatGlobalAmount(
                        displayRows.reduce((s, r) => s + (r.totalInversionPen ?? 0), 0),
                      )}
                    </td>
                    <td className={`${tdText} py-2 text-slate-500`}>—</td>
                    {canMutate ? <td /> : null}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default InversionesGeneralesPanel;
