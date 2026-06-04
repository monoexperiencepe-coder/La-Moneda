import React from 'react';
import { Save, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { Vehicle } from '../../data/types';
import type { ConductorEditDraft } from '../../utils/conductorForm';
import type { TipoDocumento, TipoDomicilio } from '../../data/types';

const TIPO_DOC_OPTS: { value: TipoDocumento; label: string }[] = [
  { value: 'DNI', label: 'DNI' },
  { value: 'CE', label: 'Carné de extranjería' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
];

const DOMICILIO_OPTS: { value: TipoDomicilio; label: string }[] = [
  { value: 'PROPIO', label: 'Propio' },
  { value: 'ALQUILADO', label: 'Alquilado' },
  { value: 'CASA DE FAMILIA', label: 'Casa de familia' },
];

const fieldClass =
  'mt-0.5 w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs focus:ring-2 focus:ring-primary-500 focus:outline-none';
const labelClass = 'text-[10px] font-semibold text-gray-500 uppercase tracking-wide';

interface Props {
  draft: ConductorEditDraft;
  vehiclesSorted: Vehicle[];
  saving: boolean;
  hasChanges: boolean;
  error: string | null;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  onChange: (patch: Partial<ConductorEditDraft>) => void;
  onCancel: () => void;
  onSave: () => void;
}

const ConductorEditPanel: React.FC<Props> = ({
  draft,
  vehiclesSorted,
  saving,
  hasChanges,
  error,
  showAdvanced,
  onToggleAdvanced,
  onChange,
  onCancel,
  onSave,
}) => (
  <div className="rounded-xl border border-primary-100 bg-white/90 p-3 shadow-sm">
    <p className="text-[10px] font-bold uppercase tracking-widest text-primary-600 mb-2">Edición rápida</p>
    {error ? (
      <p className="text-xs text-red-600 mb-2 rounded-lg bg-red-50 border border-red-100 px-2.5 py-1.5">{error}</p>
    ) : null}

    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-2">
      <label className="block col-span-1">
        <span className={labelClass}>Nombres</span>
        <input
          type="text"
          value={draft.nombres}
          onChange={(e) => onChange({ nombres: e.target.value })}
          className={fieldClass}
        />
      </label>
      <label className="block col-span-1">
        <span className={labelClass}>Apellidos</span>
        <input
          type="text"
          value={draft.apellidos}
          onChange={(e) => onChange({ apellidos: e.target.value })}
          className={fieldClass}
        />
      </label>
      <label className="block col-span-1">
        <span className={labelClass}>Tipo doc.</span>
        <select
          value={draft.tipoDocumento}
          onChange={(e) => onChange({ tipoDocumento: e.target.value as TipoDocumento })}
          className={fieldClass}
        >
          {TIPO_DOC_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block col-span-1">
        <span className={labelClass}>Nº documento</span>
        <input
          type="text"
          value={draft.numeroDocumento}
          onChange={(e) => onChange({ numeroDocumento: e.target.value })}
          className={fieldClass}
        />
      </label>
      <label className="block col-span-1">
        <span className={labelClass}>Celular</span>
        <input
          type="tel"
          value={draft.celular}
          onChange={(e) => onChange({ celular: e.target.value })}
          className={fieldClass}
        />
      </label>
      <label className="block col-span-1 sm:col-span-2">
        <span className={labelClass}>Emergencia (opcional)</span>
        <input
          type="text"
          placeholder="Contacto y teléfono"
          value={draft.numeroEmergencia}
          onChange={(e) => onChange({ numeroEmergencia: e.target.value })}
          className={fieldClass}
        />
      </label>
      <label className="block col-span-2 sm:col-span-1">
        <span className={labelClass}>Vehículo</span>
        <select
          value={draft.vehicleId}
          onChange={(e) => onChange({ vehicleId: e.target.value })}
          className={fieldClass}
        >
          <option value="">Sin asignar</option>
          {vehiclesSorted.map((v) => (
            <option key={v.id} value={String(v.id)}>
              #{v.id} · {v.placa} · {v.marca} {v.modelo}
            </option>
          ))}
        </select>
      </label>
      <label className="block col-span-1">
        <span className={labelClass}>Contrato</span>
        <select
          value={draft.estadoContrato}
          onChange={(e) =>
            onChange({ estadoContrato: e.target.value as 'ABIERTO' | 'CERRADO' })
          }
          className={fieldClass}
        >
          <option value="ABIERTO">Abierto</option>
          <option value="CERRADO">Cerrado</option>
        </select>
      </label>
      <label className="block col-span-1">
        <span className={labelClass}>Estado</span>
        <select
          value={draft.estado}
          onChange={(e) => onChange({ estado: e.target.value as 'VIGENTE' | 'SUSPENDIDO' })}
          className={fieldClass}
        >
          <option value="VIGENTE">Vigente</option>
          <option value="SUSPENDIDO">Suspendido</option>
        </select>
      </label>
      <label className="block col-span-2 sm:col-span-3 lg:col-span-4">
        <span className={labelClass}>Comentarios</span>
        <textarea
          rows={2}
          value={draft.comentarios}
          onChange={(e) => onChange({ comentarios: e.target.value })}
          className={`${fieldClass} resize-y min-h-[2.25rem]`}
        />
      </label>
    </div>

    {showAdvanced ? (
      <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
        <label className="block col-span-1">
          <span className={labelClass}>Domicilio</span>
          <select
            value={draft.domicilio}
            onChange={(e) => onChange({ domicilio: e.target.value as TipoDomicilio })}
            className={fieldClass}
          >
            {DOMICILIO_OPTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block col-span-1">
          <span className={labelClass}>Cochera</span>
          <input
            type="text"
            value={draft.cochera}
            onChange={(e) => onChange({ cochera: e.target.value })}
            className={fieldClass}
          />
        </label>
        <label className="block col-span-2 sm:col-span-1">
          <span className={labelClass}>Inicio contrato</span>
          <input
            type="date"
            value={draft.fechaInicioContrato}
            onChange={(e) => onChange({ fechaInicioContrato: e.target.value })}
            className={fieldClass}
          />
        </label>
        <label className="block col-span-2 sm:col-span-1">
          <span className={labelClass}>Venc. contrato</span>
          <input
            type="date"
            value={draft.fechaVencimientoContrato}
            onChange={(e) => onChange({ fechaVencimientoContrato: e.target.value })}
            className={fieldClass}
          />
        </label>
        <label className="block col-span-2 sm:col-span-2">
          <span className={labelClass}>Dirección</span>
          <input
            type="text"
            value={draft.direccion}
            onChange={(e) => onChange({ direccion: e.target.value })}
            className={fieldClass}
          />
        </label>
        <label className="block col-span-1">
          <span className={labelClass}>Doc. firmado</span>
          <select
            value={draft.documentoFirmado}
            onChange={(e) =>
              onChange({
                documentoFirmado: e.target.value as ConductorEditDraft['documentoFirmado'],
              })
            }
            className={fieldClass}
          >
            <option value="unset">Sin registrar</option>
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
        </label>
        <label className="block col-span-2 sm:col-span-2">
          <span className={labelClass}>Status original (Excel)</span>
          <input
            type="text"
            value={draft.statusOriginal}
            onChange={(e) => onChange({ statusOriginal: e.target.value })}
            className={fieldClass}
          />
        </label>
      </div>
    ) : null}

    <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-gray-100">
      <button
        type="button"
        disabled={saving || !hasChanges}
        onClick={onSave}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 text-white text-xs font-semibold hover:bg-primary-600 disabled:opacity-50"
      >
        {saving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Save size={14} />}
        {saving ? 'Guardando…' : hasChanges ? 'Guardar cambios' : 'Sin cambios'}
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={onCancel}
        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        Cancelar
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={onToggleAdvanced}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 border border-gray-200"
      >
        {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {showAdvanced ? 'Menos detalles' : 'Más detalles'}
      </button>
    </div>
  </div>
);

export default ConductorEditPanel;
