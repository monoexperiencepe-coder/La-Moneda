import React from 'react';
import type { VehicleFichaTecnicaDraft } from '../../utils/vehicleFichaTecnica';

const labelClass = 'text-[10px] font-semibold text-gray-500 uppercase tracking-wide';
const fieldClass =
  'mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-600';

type Props = {
  draft: VehicleFichaTecnicaDraft;
  onChange: (patch: Partial<VehicleFichaTecnicaDraft>) => void;
  disabled?: boolean;
  /** Ocultar identidad básica (placa/marca/modelo/año) si ya está en otro formulario. */
  hideIdentity?: boolean;
};

const VehicleFichaTecnicaFields: React.FC<Props> = ({
  draft,
  onChange,
  disabled = false,
  hideIdentity = false,
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {!hideIdentity ? (
      <>
        <label className="block">
          <span className={labelClass}>Placa</span>
          <input
            type="text"
            value={draft.placa}
            disabled={disabled}
            onChange={(e) => onChange({ placa: e.target.value.toUpperCase() })}
            className={`${fieldClass} uppercase`}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Marca</span>
          <input
            type="text"
            value={draft.marca}
            disabled={disabled}
            onChange={(e) => onChange({ marca: e.target.value })}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Modelo</span>
          <input
            type="text"
            value={draft.modelo}
            disabled={disabled}
            onChange={(e) => onChange({ modelo: e.target.value })}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Año</span>
          <input
            type="number"
            min={1900}
            max={2100}
            value={draft.anio}
            disabled={disabled}
            onChange={(e) => onChange({ anio: e.target.value })}
            className={fieldClass}
          />
        </label>
      </>
    ) : null}
    <label className="block">
      <span className={labelClass}>Combustible</span>
      <input
        type="text"
        value={draft.combustible}
        disabled={disabled}
        onChange={(e) => onChange({ combustible: e.target.value })}
        placeholder="Ej. BI-COMBUSTIBLE-GNV-GASOLINA"
        className={fieldClass}
      />
    </label>
    <label className="block">
      <span className={labelClass}>Color</span>
      <input
        type="text"
        value={draft.color}
        disabled={disabled}
        onChange={(e) => onChange({ color: e.target.value })}
        className={fieldClass}
      />
    </label>
    <label className="block">
      <span className={labelClass}>Tipo carrocería</span>
      <input
        type="text"
        value={draft.tipoCarroceria}
        disabled={disabled}
        onChange={(e) => onChange({ tipoCarroceria: e.target.value })}
        placeholder="Ej. SUV"
        className={fieldClass}
      />
    </label>
    <label className="block">
      <span className={labelClass}>N° motor</span>
      <input
        type="text"
        value={draft.numeroMotor}
        disabled={disabled}
        onChange={(e) => onChange({ numeroMotor: e.target.value })}
        className={`${fieldClass} font-mono text-xs`}
      />
    </label>
    <label className="block">
      <span className={labelClass}>Llaves</span>
      <input
        type="number"
        min={0}
        step={1}
        value={draft.cantidadLlaves}
        disabled={disabled}
        onChange={(e) => onChange({ cantidadLlaves: e.target.value })}
        placeholder="0"
        className={fieldClass}
      />
    </label>
    <label className="block">
      <span className={labelClass}>GPS 1</span>
      <input
        type="text"
        value={draft.gps1}
        disabled={disabled}
        onChange={(e) => onChange({ gps1: e.target.value })}
        placeholder="0"
        className={fieldClass}
      />
    </label>
    <label className="block">
      <span className={labelClass}>GPS 2</span>
      <input
        type="text"
        value={draft.gps2}
        disabled={disabled}
        onChange={(e) => onChange({ gps2: e.target.value })}
        placeholder="0"
        className={fieldClass}
      />
    </label>
    <label className="block">
      <span className={labelClass}>Impuesto</span>
      <input
        type="text"
        value={draft.impuesto}
        disabled={disabled}
        onChange={(e) => onChange({ impuesto: e.target.value })}
        placeholder="Ej. NO PAGA"
        className={fieldClass}
      />
    </label>
    <label className="block">
      <span className={labelClass}>KM inicial</span>
      <input
        type="number"
        min={0}
        step={1}
        value={draft.kmInicial}
        disabled={disabled}
        onChange={(e) => onChange({ kmInicial: e.target.value })}
        placeholder="0"
        className={fieldClass}
      />
    </label>
    <label className="block sm:col-span-2">
      <span className={labelClass}>Tarjeta propiedad</span>
      <input
        type="text"
        value={draft.tarjetaPropiedad}
        disabled={disabled}
        onChange={(e) => onChange({ tarjetaPropiedad: e.target.value })}
        placeholder="Ej. VIRTUAL"
        className={fieldClass}
      />
    </label>
    <label className="block sm:col-span-2">
      <span className={labelClass}>Propietario</span>
      <input
        type="text"
        value={draft.propietarioNombre}
        disabled={disabled}
        onChange={(e) => onChange({ propietarioNombre: e.target.value })}
        className={fieldClass}
      />
    </label>
  </div>
);

export default VehicleFichaTecnicaFields;
