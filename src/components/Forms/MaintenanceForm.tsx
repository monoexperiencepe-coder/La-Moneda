import React, { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import Button from '../Common/Button';
import Input from '../Common/Input';
import Select from '../Common/Select';
import Card from '../Common/Card';
import { Mantenimiento, Vehicle } from '../../data/types';
import { TIPOS_DOCUMENTO, TIPOS_DOMICILIO } from '../../data/catalogs';
import { todayStr } from '../../utils/formatting';

interface MaintenanceFormProps {
  vehicles: Vehicle[];
  onSubmit: (mant: Omit<Mantenimiento, 'id' | 'createdAt'>) => void;
}

const initialState = {
  fechaRegistro: todayStr(),
  vehicleId: '',
  documentoResponsable: '',
  numeroDocumento: '',
  nombres: '',
  apellidos: '',
  celular: '',
  domicilio: '',
  cochera: '',
  direccion: '',
  referencia: '',
  documentoFirmado: '',
  fechaVencimientoContrato: '',
  mantenimientoRealizado: '',
  compraBateriaNueva: '',
  kilometraje: '',
  costo: '',
};

const MaintenanceForm: React.FC<MaintenanceFormProps> = ({ vehicles, onSubmit }) => {
  const [form, setForm] = useState(initialState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.vehicleId) e.vehicleId = 'Selecciona un vehículo';
    if (!form.nombres) e.nombres = 'Requerido';
    if (!form.apellidos) e.apellidos = 'Requerido';
    if (!form.celular) e.celular = 'Requerido';
    if (!form.kilometraje || Number(form.kilometraje) < 0) e.kilometraje = 'Kilometraje inválido';
    if (!form.costo || Number(form.costo) < 0) e.costo = 'Costo inválido';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 400));
    onSubmit({
      fechaRegistro: form.fechaRegistro,
      vehicleId: Number(form.vehicleId),
      documentoResponsable: (form.documentoResponsable || 'DNI') as Mantenimiento['documentoResponsable'],
      numeroDocumento: form.numeroDocumento,
      nombres: form.nombres,
      apellidos: form.apellidos,
      celular: form.celular,
      domicilio: (form.domicilio || 'PROPIO') as Mantenimiento['domicilio'],
      cochera: form.cochera,
      direccion: form.direccion,
      referencia: form.referencia,
      documentoFirmado: form.documentoFirmado === 'true',
      fechaVencimientoContrato: form.fechaVencimientoContrato,
      mantenimientoRealizado: form.mantenimientoRealizado === 'true',
      compraBateriaNueva: form.compraBateriaNueva === 'true',
      kilometraje: Number(form.kilometraje),
      costo: Number(form.costo),
    });
    setForm({ ...initialState, fechaRegistro: todayStr() });
    setErrors({});
    setLoading(false);
  };

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  const boolOptions = [
    { value: 'true', label: 'Sí' },
    { value: 'false', label: 'No' },
  ];

  return (
    <Card title="Registrar Mantenimiento" subtitle="Datos del responsable y servicio realizado">
      <form onSubmit={handleSubmit} className="space-y-6 mt-2">
        {/* Vehicle & Date */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
            📋 Información del Registro
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Fecha de Registro" type="date" value={form.fechaRegistro}
              onChange={e => set('fechaRegistro', e.target.value)} required />
            <Select
              label="Carro Asignado"
              options={vehicles.filter(v => v.activo).map(v => ({
                value: v.id, label: `#${v.id} — ${v.marca} ${v.modelo} (${v.placa})`,
              }))}
              value={form.vehicleId}
              placeholder="Seleccionar vehículo..."
              onChange={v => { set('vehicleId', v); setErrors(p => ({ ...p, vehicleId: '' })); }}
              error={errors.vehicleId}
              required
            />
          </div>
        </div>

        {/* Responsible */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
            👤 Datos del Responsable
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Tipo Documento"
              options={TIPOS_DOCUMENTO.map(d => ({ value: d, label: d }))}
              value={form.documentoResponsable}
              placeholder="DNI / CE / Pasaporte"
              onChange={v => set('documentoResponsable', v)}
            />
            <Input label="N° Documento" type="text" value={form.numeroDocumento}
              onChange={e => set('numeroDocumento', e.target.value)} placeholder="12345678" />
            <Input label="Nombres" type="text" value={form.nombres}
              onChange={e => { set('nombres', e.target.value); setErrors(p => ({ ...p, nombres: '' })); }}
              error={errors.nombres} required />
            <Input label="Apellidos" type="text" value={form.apellidos}
              onChange={e => { set('apellidos', e.target.value); setErrors(p => ({ ...p, apellidos: '' })); }}
              error={errors.apellidos} required />
            <Input label="Celular" type="tel" value={form.celular}
              onChange={e => { set('celular', e.target.value); setErrors(p => ({ ...p, celular: '' })); }}
              error={errors.celular} placeholder="987654321" required />
            <Select
              label="Tipo Domicilio"
              options={TIPOS_DOMICILIO.map(d => ({ value: d, label: d }))}
              value={form.domicilio}
              placeholder="Seleccionar..."
              onChange={v => set('domicilio', v)}
            />
            <Input label="Cochera" type="text" value={form.cochera}
              onChange={e => set('cochera', e.target.value)} placeholder="Nombre de la cochera" />
            <Input label="Dirección" type="text" value={form.direccion}
              onChange={e => set('direccion', e.target.value)} placeholder="Dirección completa" />
            <Input label="Referencia" type="text" value={form.referencia}
              onChange={e => set('referencia', e.target.value)} placeholder="Al lado de..." />
          </div>
        </div>

        {/* Contract & Maintenance */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b border-gray-100">
            🔧 Contrato y Mantenimiento
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Documento Firmado" options={boolOptions} value={form.documentoFirmado}
              placeholder="¿Firmado?" onChange={v => set('documentoFirmado', v)} />
            <Input label="Vencimiento de Contrato" type="date" value={form.fechaVencimientoContrato}
              onChange={e => set('fechaVencimientoContrato', e.target.value)} />
            <Select label="Mantenimiento Realizado" options={boolOptions} value={form.mantenimientoRealizado}
              placeholder="¿Realizado?" onChange={v => set('mantenimientoRealizado', v)} />
            <Select label="Compra de Batería Nueva" options={boolOptions} value={form.compraBateriaNueva}
              placeholder="¿Batería nueva?" onChange={v => set('compraBateriaNueva', v)} />
            <Input label="Kilometraje" type="number" min="0" value={form.kilometraje}
              onChange={e => { set('kilometraje', e.target.value); setErrors(p => ({ ...p, kilometraje: '' })); }}
              error={errors.kilometraje} placeholder="45200" required />
            <Input label="Costo (S/)" type="number" min="0" step="0.01" value={form.costo}
              onChange={e => { set('costo', e.target.value); setErrors(p => ({ ...p, costo: '' })); }}
              error={errors.costo} placeholder="0.00" required />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={() => { setForm({ ...initialState, fechaRegistro: todayStr() }); setErrors({}); }}>
            Limpiar
          </Button>
          <Button type="submit" loading={loading} icon={<PlusCircle size={16} />}>
            Registrar Mantenimiento
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default MaintenanceForm;
