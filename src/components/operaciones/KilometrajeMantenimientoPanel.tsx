import React, { useEffect, useMemo, useState } from 'react';
import Card from '../Common/Card';
import Input from '../Common/Input';
import Select from '../Common/Select';
import { formatCurrency, formatDate, todayStr } from '../../utils/formatting';
import { diffDaysFromToday } from '../../utils/fleetPanel';
import type { KilometrajeRegistro, Vehicle } from '../../data/types';
import { Trash2 } from 'lucide-react';

interface Props {
  vehicles: Vehicle[];
  kilometrajes: KilometrajeRegistro[];
  addKilometraje: (row: Omit<KilometrajeRegistro, 'id' | 'createdAt'>) => Promise<KilometrajeRegistro | null>;
  deleteKilometraje: (id: number) => Promise<boolean>;
  getVehicleLabel: (vehicleId: number | null) => string;
  /** Si se pasa, el formulario y las tablas solo muestran esta unidad (detalle vehículo). */
  restrictVehicleId?: number;
}

const KilometrajeMantenimientoPanel: React.FC<Props> = ({
  vehicles,
  kilometrajes,
  addKilometraje,
  deleteKilometraje,
  getVehicleLabel,
  restrictVehicleId,
}) => {
  const active = vehicles.filter((v) => v.activo);
  const [km, setKm] = useState({
    vehicleId: '',
    fecha: todayStr(),
    kmMantenimiento: '',
    kilometraje: '',
    descripcion: '',
    costo: '',
  });

  useEffect(() => {
    if (restrictVehicleId == null) return;
    const ok = vehicles.some((v) => v.activo && v.id === restrictVehicleId);
    if (!ok) return;
    setKm((p) => ({ ...p, vehicleId: String(restrictVehicleId) }));
  }, [restrictVehicleId, vehicles]);

  const controlKm = useMemo(() => {
    const byVehicle = new Map<number, KilometrajeRegistro[]>();
    kilometrajes.forEach((r) => {
      const arr = byVehicle.get(r.vehicleId) ?? [];
      arr.push(r);
      byVehicle.set(r.vehicleId, arr);
    });

    const entries = Array.from(byVehicle.entries()).filter(([vid]) =>
      restrictVehicleId == null ? true : vid === restrictVehicleId,
    );
    return entries.map(([vehicleId, rows]) => {
      const maxKmMant = rows.reduce<number | null>((acc, r) => {
        if (r.kmMantenimiento == null) return acc;
        return acc == null ? r.kmMantenimiento : Math.max(acc, r.kmMantenimiento);
      }, null);
      const maxKm = rows.reduce<number | null>((acc, r) => {
        if (r.kilometraje == null) return acc;
        return acc == null ? r.kilometraje : Math.max(acc, r.kilometraje);
      }, null);
      const fMant =
        maxKmMant == null
          ? null
          : rows
              .filter((r) => r.kmMantenimiento === maxKmMant)
              .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.fecha ?? null;
      const fUlt =
        maxKm == null
          ? null
          : rows
              .filter((r) => r.kilometraje === maxKm)
              .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.fecha ?? null;
      const variacion = maxKm != null && maxKmMant != null ? maxKm - maxKmMant : null;
      const dias = fMant && fUlt ? Math.abs(diffDaysFromToday(fMant) - diffDaysFromToday(fUlt)) : null;
      const lastMantDesc =
        rows
          .filter((r) => r.descripcion?.trim())
          .sort((a, b) => (b.fecha + b.createdAt).localeCompare(a.fecha + a.createdAt))[0]
          ?.descripcion?.trim()
          ?.toUpperCase() ?? '';

      return {
        vehicleId,
        kmMant: maxKmMant,
        kmUlt: maxKm,
        fMant,
        fUlt,
        variacion,
        dias,
        mantRealizado:
          lastMantDesc || (variacion != null && variacion >= 3500 ? 'MANT.COMPLETO' : 'MANT.SIMPLE'),
      };
    });
  }, [kilometrajes, restrictVehicleId]);

  const ultimos = useMemo(() => {
    const base = restrictVehicleId != null ? kilometrajes.filter((r) => r.vehicleId === restrictVehicleId) : kilometrajes;
    return [...base].sort((a, b) => b.id - a.id).slice(0, restrictVehicleId != null ? 40 : 60);
  }, [kilometrajes, restrictVehicleId]);

  return (
    <div className="space-y-5">
      <Card title="Registrar kilometraje" subtitle="Misma tabla Supabase que antes estaba en Control global">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Select
            label="Vehículo"
            options={active.map((v) => ({ value: String(v.id), label: `${v.placa} · ${v.marca}` }))}
            value={km.vehicleId}
            placeholder="Elegir"
            onChange={(v) => setKm((p) => ({ ...p, vehicleId: v }))}
            disabled={restrictVehicleId != null}
          />
          <Input label="Fecha" type="date" value={km.fecha} onChange={(e) => setKm((p) => ({ ...p, fecha: e.target.value }))} />
          <Input
            label="KM mantenimiento"
            type="number"
            value={km.kmMantenimiento}
            onChange={(e) => setKm((p) => ({ ...p, kmMantenimiento: e.target.value }))}
          />
          <Input
            label="Kilometraje actual"
            type="number"
            value={km.kilometraje}
            onChange={(e) => setKm((p) => ({ ...p, kilometraje: e.target.value }))}
          />
          <Input label="Descripción" value={km.descripcion} onChange={(e) => setKm((p) => ({ ...p, descripcion: e.target.value }))} />
          <Input label="Costo (S/)" type="number" value={km.costo} onChange={(e) => setKm((p) => ({ ...p, costo: e.target.value }))} />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!km.vehicleId}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-sm font-semibold"
            onClick={() => {
              void addKilometraje({
                vehicleId: Number(km.vehicleId),
                fecha: km.fecha,
                fechaRegistro: todayStr(),
                kmMantenimiento: km.kmMantenimiento ? Number(km.kmMantenimiento) : null,
                kilometraje: km.kilometraje ? Number(km.kilometraje) : null,
                descripcion: km.descripcion.trim(),
                costo: km.costo ? Number(km.costo) : null,
              });
            }}
          >
            Guardar kilometraje
          </button>
        </div>
      </Card>

      <Card title="Control KMS (referencia rápida)" subtitle="Variación entre último KM de mantenimiento y último KM registrado">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b">
                <th className="text-left py-2">Unidad</th>
                <th className="text-right py-2">Km mant.</th>
                <th className="text-right py-2">Km actual</th>
                <th className="text-right py-2">Variación</th>
                <th className="text-right py-2">Δ días</th>
                <th className="text-right py-2">Mant.</th>
              </tr>
            </thead>
            <tbody>
              {controlKm.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 text-sm">
                    Sin registros de kilometraje
                  </td>
                </tr>
              ) : (
                controlKm.map((r) => (
                  <tr key={r.vehicleId} className="border-b border-gray-50">
                    <td className="py-2">{getVehicleLabel(r.vehicleId)}</td>
                    <td className="py-2 text-right tabular-nums">{r.kmMant ?? '—'}</td>
                    <td className="py-2 text-right tabular-nums">{r.kmUlt ?? '—'}</td>
                    <td className="py-2 text-right tabular-nums">{r.variacion ?? '—'}</td>
                    <td className="py-2 text-right">{r.dias ?? '—'}</td>
                    <td className="py-2 text-right text-xs font-semibold">{r.mantRealizado}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Últimos registros de kilometraje">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-xs text-gray-500 uppercase border-b">
                <th className="text-left py-2">Fecha</th>
                <th className="text-left py-2">Unidad</th>
                <th className="text-right py-2">KM mant.</th>
                <th className="text-right py-2">KM</th>
                <th className="text-right py-2">Costo</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {ultimos.map((r) => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="py-2">{formatDate(r.fecha)}</td>
                  <td className="py-2 text-xs">{getVehicleLabel(r.vehicleId)}</td>
                  <td className="py-2 text-right">{r.kmMantenimiento ?? '—'}</td>
                  <td className="py-2 text-right">{r.kilometraje ?? '—'}</td>
                  <td className="py-2 text-right">{r.costo != null ? formatCurrency(r.costo) : '—'}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void deleteKilometraje(r.id)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default KilometrajeMantenimientoPanel;
