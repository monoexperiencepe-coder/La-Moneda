import React, { useMemo } from 'react';
import {
  getDetallesMetodoPago,
  MetodoPagoDetalleRow,
} from '../../data/factCatalog';
import { countRegistrosPorCuenta } from '../../utils/ingresoPagoStats';

export interface MetodoCuentaPickerProps {
  /** Botones de método visibles (ej. METODOS_INGRESO_RAPIDO o METODOS_PAGO). */
  metodosChips: readonly string[];
  metodoPago: string;
  metodoPagoDetalle: string;
  onChange: (payload: {
    metodoPago: string;
    metodoPagoDetalle: string;
    celularMetodo: string | null;
  }) => void;
  /** Ingresos o gastos para badges de conteo por cuenta */
  registrosForCount: Array<{ metodoPago: string; metodoPagoDetalle: string }>;
  theme: 'emerald' | 'rose';
  /** Texto del pie del conteo: "ingresos" | "gastos" */
  conteoEtiqueta?: string;
}

const chipActive: Record<MetodoCuentaPickerProps['theme'], string> = {
  emerald: 'border-emerald-500 bg-emerald-500 text-white shadow-sm',
  rose: 'border-rose-500 bg-rose-500 text-white shadow-sm',
};

const chipIdle = 'border-gray-200 text-gray-700 hover:border-gray-300';

const cuentaActive: Record<MetodoCuentaPickerProps['theme'], string> = {
  emerald: 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200',
  rose: 'border-rose-500 bg-rose-50 ring-1 ring-rose-200',
};

const cuentaIdle = 'border-transparent bg-white hover:bg-white hover:border-gray-200';

const celularClass: Record<MetodoCuentaPickerProps['theme'], string> = {
  emerald: 'text-emerald-700',
  rose: 'text-rose-700',
};

const MetodoCuentaPicker: React.FC<MetodoCuentaPickerProps> = ({
  metodosChips,
  metodoPago,
  metodoPagoDetalle,
  onChange,
  registrosForCount,
  theme,
  conteoEtiqueta = 'registros',
}) => {
  const cuentas = useMemo(() => getDetallesMetodoPago(metodoPago), [metodoPago]);

  const pick = (row: MetodoPagoDetalleRow) => {
    onChange({
      metodoPago: row.metodo,
      metodoPagoDetalle: row.detalle.trim(),
      celularMetodo: row.celular?.trim() ? row.celular.trim() : null,
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="label mb-2">Método de pago</p>
        <div className="flex flex-wrap gap-2">
          {metodosChips.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => {
                const rows = getDetallesMetodoPago(m);
                const first = rows[0];
                if (first) pick(first);
                else {
                  onChange({
                    metodoPago: m,
                    metodoPagoDetalle: m === 'Efectivo' ? 'Caja principal' : 'Otro medio / especificar',
                    celularMetodo: null,
                  });
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all
                ${metodoPago === m ? chipActive[theme] : chipIdle}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {cuentas.length > 0 && (
        <div>
          <p className="label mb-2">
            Cuenta {metodoPago === 'Yape' && <span className="text-gray-400 font-normal">(10)</span>}
            {metodoPago === 'Plin' && <span className="text-gray-400 font-normal">(8)</span>}
            {metodoPago === 'Transferencia' && <span className="text-gray-400 font-normal">(5)</span>}
          </p>
          <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50/80 p-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {cuentas.map(row => {
              const active = metodoPagoDetalle.trim() === row.detalle.trim();
              const n = countRegistrosPorCuenta(registrosForCount, row.metodo, row.detalle);
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => pick(row)}
                  className={`text-left rounded-lg px-2.5 py-2 text-xs transition-all border
                    ${active ? cuentaActive[theme] : cuentaIdle}`}
                >
                  <span className="font-medium text-gray-900 line-clamp-2">{row.detalle.trim()}</span>
                  {row.celular ? (
                    <span className={`block font-mono text-[11px] mt-0.5 ${celularClass[theme]}`}>{row.celular}</span>
                  ) : (
                    <span className="block text-[11px] text-gray-400 mt-0.5">—</span>
                  )}
                  {(metodoPago === 'Yape' || metodoPago === 'Plin' || metodoPago === 'Transferencia') && n > 0 && (
                    <span className="inline-block mt-1 text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      {n} reg.
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {(metodoPago === 'Yape' || metodoPago === 'Plin' || metodoPago === 'Transferencia') && (
            <p className="text-[11px] text-gray-500 mt-1.5">
              Conteo de {conteoEtiqueta} por cuenta en esta app (útil para cuadrar medios de pago).
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default MetodoCuentaPicker;
