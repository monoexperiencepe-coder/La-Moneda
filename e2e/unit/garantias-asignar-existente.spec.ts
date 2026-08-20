import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

test('detecta y explica una garantía activa sin vehículo', () => {
  const src = read('src/components/garantias/CrearGarantiaModal.tsx');
  expect(src).toContain('g.driverId === driverId && g.currentVehicleId == null');
  expect(src).toContain('sin vehículo');
  expect(src).toContain('Asignar garantía existente al vehículo');
});

test('asigna mediante un RPC estrecho y no crea otra garantía', () => {
  const src = read('src/services/garantiasService.ts');
  const fn = src.slice(src.indexOf('export async function assignExistingGuaranteeToVehicle'));
  expect(fn).toContain("supabase.rpc('assign_existing_driver_guarantee_vehicle'");
  expect(fn).not.toContain('createDriverGuarantee(');
  expect(fn).not.toContain("from('guarantee_movements')");
});

test('RPC conserva saldos y movements y solo admite recursos del tenant', () => {
  const sql = read('supabase/migration_garantias_assign_existing_vehicle.sql');
  const rpc = sql.slice(sql.indexOf('create or replace function public.assign_existing_driver_guarantee_vehicle'));
  const setClause = rpc.slice(rpc.indexOf('update public.driver_guarantees'), rpc.indexOf('returning * into'));
  expect(setClause).not.toMatch(/required_amount\s*=/);
  expect(setClause).not.toMatch(/current_balance\s*=/);
  expect(setClause).not.toMatch(/total_contributed\s*=/);
  expect(setClause).not.toMatch(/total_deducted\s*=/);
  expect(setClause).toContain('current_vehicle_id = p_vehicle_id');
  expect(sql).not.toMatch(/(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.guarantee_movements/i);
  expect(sql).toContain('empresa_no_coincide');
  expect(sql).toContain('vehiculo_no_pertenece_empresa');
});

test('vehículo ocupado se rechaza y la carrera queda cubierta por índice único', () => {
  const sql = read('supabase/migration_garantias_assign_existing_vehicle.sql');
  expect(sql).toContain('vehiculo_ya_tiene_garantia_activa');
  expect(sql).toContain('driver_guarantees_one_active_per_vehicle_uidx');
});

test('Actuales muestra huérfanas y desaparecen del conjunto al asignar', () => {
  const src = read('src/pages/Operaciones/Garantias.tsx');
  expect(src).toContain('rows.filter((r) => r.currentVehicleId == null)');
  expect(src).toContain('Garantías activas sin vehículo');
});
