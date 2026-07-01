# VEHICLE_TECHNICAL_INFO_IMPORT_REPORT

Generado: 2026-07-01T05:21:45.554Z

## Fuente

- Excel: `C:\LA MONEDA\caracteristica auto (2).xlsx`
- Hoja: `Hoja1`
- Empresa: `07593982-08e6-450c-8abe-4bf590609dd7`
- Modo: ESCRITURA

## Resumen

| Métrica | Valor |
|---------|------:|
| Total filas Excel | 83 |
| Placas encontradas | 83 |
| Placas no encontradas | 0 |
| Actualizaciones aplicadas | 83 |
| Sin cambios | 0 |
| Conflictos reportados | 0 |

## Campos actualizados (conteo)

- `combustible`: 83
- `tipo_carroceria`: 83
- `numero_motor`: 81
- `cantidad_llaves`: 83
- `gps_1`: 83
- `gps_2`: 82
- `impuesto`: 83
- `km_inicial`: 83
- `tarjeta_propiedad`: 83
- `propietario_nombre`: 83

## Placas no encontradas

_Ninguna_

## Conflictos

_Ninguno_

## Ejemplo CAU677 / Unidad #83

Buscar en actualizados: placa que normaliza a CAU677.

Encontrada id=178. Patch: `{"combustible":"BI-COMBUSTIBLE-GNV-GASOLINA","tipo_carroceria":"SUV","numero_motor":"SFG1822306928","cantidad_llaves":2,"gps_1":"0","gps_2":"0","impuesto":"NO PAGA","km_inicial":0,"tarjeta_propiedad":"VIRTUAL","propietario_nombre":"DSB Y ASB"}`

## Cómo aplicar en producción

1. Ejecutar `supabase/migration_vehiculos_ficha_tecnica.sql` en Supabase.
2. `node scripts/import_vehicle_technical_from_xlsx.mjs "ruta/al/excel.xlsx"` (dry run).
3. Revisar conflictos en este reporte.
4. `DRY_RUN=0 ALLOW_IMPORT_VEHICLE_TECHNICAL=1 node scripts/import_vehicle_technical_from_xlsx.mjs "..."`
