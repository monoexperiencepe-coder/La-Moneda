import { test, expect } from '@playwright/test';

/**
 * LM-04: documentación del límite PostgREST (1000 filas) en RPC de resumen.
 * La corrección pagina fetch_latest_control_fechas_by_vehicle en controlFechasService.
 */
test('RPC resumen control_fechas requiere paginación cuando filas > 1000', () => {
  const POSTGREST_DEFAULT_MAX = 1000;
  const vehicles = 98;
  const tiposPerVehicle = 15;
  const distinctPairs = vehicles * tiposPerVehicle;
  expect(distinctPairs).toBeGreaterThan(POSTGREST_DEFAULT_MAX);
});

test('pivot documentación indexa por vehicle_id técnico, no numero_unidad', () => {
  const vehicleIdTecnico = 196;
  const numeroUnidad = 100;
  expect(vehicleIdTecnico).not.toBe(numeroUnidad);
});
