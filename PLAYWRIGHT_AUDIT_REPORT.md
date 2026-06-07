# Playwright — Informe de auditoría (solo lectura)

**Fecha:** 2026-05-30  
**Alcance:** Estado actual antes de nuevos tests globales. Sin ejecución de suite, sin cambios de configuración.

---

## Estado actual

La suite E2E está **madura para smoke operativo/financiero** en un entorno **local o staging DEV**, con un diseño explícito de **seguridad por URL**, **prefijos QA** y **cleanup al final de la suite**. No existe carpeta `tests/` separada: todo vive en `e2e/`.

| Aspecto | Estado |
|--------|--------|
| Framework | `@playwright/test` ^1.52.0 |
| Config | `playwright.config.ts` (único) |
| Suites | 1 setup + 8 archivos smoke |
| Paralelismo | `workers: 1`, `fullyParallel: false` (serial por diseño) |
| Auth persistida | Sí → `e2e/.auth/user.json` |
| Escritura en BD | Opt-in `QA_ALLOW_DB_WRITES=1` |
| Cleanup automático | Sí → `globalTeardown` + registry JSON |
| Cobertura módulos nuevos | Disponibilidad operativa, ingresos, pendientes, utilidad, realtime: **sin tests** |

---

## Archivos encontrados

### Configuración y entrada

| Archivo | Rol |
|---------|-----|
| `playwright.config.ts` | Config principal: `testDir: e2e`, proyectos `setup` + `smoke`, `webServer`, reporters |
| `package.json` | Scripts: `test:e2e`, `test:e2e:headed`, `test:e2e:report` |
| `.env.qa.example` | Plantilla de credenciales QA (no commitear `.env.qa`) |
| `e2e/README.md` | Documentación operativa (parcialmente desactualizada vs archivos 05–08) |

### Ciclo de vida

| Archivo | Rol |
|---------|-----|
| `e2e/auth.setup.ts` | Proyecto `setup`: login UI → `storageState` |
| `e2e/global-setup.ts` | `assertNotProduction()` + `resetQaRegistry()` |
| `e2e/global-teardown.ts` | Log sesión + `cleanupQaEntities()` si writes habilitados |

### Helpers

| Archivo | Rol |
|---------|-----|
| `e2e/helpers/qa.ts` | Prefijos `QA_*`, `QA_ALLOW_DB_WRITES`, credenciales, guard anti-producción |
| `e2e/helpers/auth.ts` | `loginViaUi`, `loginAsContador`, `expectDashboardLoaded` |
| `e2e/helpers/qa-registry.ts` | Registry `e2e/.qa-artifacts/registry.json`, tipos gasto/vehículo/km/control_fecha |
| `e2e/helpers/qa-cleanup.ts` | Borrado API/UI con validación de prefijo antes de DELETE |
| `e2e/helpers/qa-supabase.ts` | Cliente Supabase autenticado, verificación filas QA |
| `e2e/helpers/gastos-form.ts` | Flujos gastos, undo, historial, registro con `registerQaGasto` |
| `e2e/helpers/kilometraje-form.ts` | KM + undo, vehículo QA auxiliar |
| `e2e/helpers/flota-form.ts` | Inventario, editar, eliminar, asignar conductor (Fase C) |
| `e2e/helpers/documentacion-form.ts` | control_fechas / vencimientos QA |

### Fixtures y reporters

| Archivo | Rol |
|---------|-----|
| `e2e/fixtures/console.ts` | Extiende `test`: consola en fallos + `setQaCurrentTest` por `beforeEach` |
| `e2e/reporters/flow-summary-reporter.ts` | Resumen por flujo en consola al final |

### Specs (smoke)

| Archivo | Tests aprox. |
|---------|----------------|
| `e2e/smoke/01-login-dashboard.spec.ts` | 1 (sesión + dashboard) |
| `e2e/smoke/02-gastos.spec.ts` | ~15 (mutaciones + undo + lectura filtros) |
| `e2e/smoke/03-flota.spec.ts` | 3 (inventario + alta vehículo UI) |
| `e2e/smoke/04-ia.spec.ts` | 1 (asistente, timeout 180s) |
| `e2e/smoke/05-kilometraje.spec.ts` | ~10 (unit payload + mutaciones + undo) |
| `e2e/smoke/06-flota.spec.ts` | 4 mutaciones flota avanzada |
| `e2e/smoke/07-documentacion.spec.ts` | 3 (CRUD vencimientos QA) |
| `e2e/smoke/08-contador-permissions.spec.ts` | Unit permisos + 3 smoke contador/admin |

### Artefactos (gitignored)

- `e2e/.auth/user.json` — cookies/sesión post-login QA
- `e2e/.qa-artifacts/registry.json` — IDs creados en la sesión
- `e2e/.qa-artifacts/cleanup-report.json` — fallos de cleanup
- `playwright-report/`, `test-results/`

**No existe:** carpeta `tests/`, `playwright/` con tests adicionales, `globalSetup` de Playwright distinto al de `e2e/global-setup.ts` (sí está referenciado en config).

---

## Scripts disponibles (`package.json`)

```json
"test:e2e": "playwright test",
"test:e2e:headed": "playwright test --headed",
"test:e2e:report": "playwright show-report playwright-report"
```

No hay scripts por suite (`test:e2e:smoke`), por grep, ni CI documentado en el repo para Playwright.

---

## Configuración relevante (`playwright.config.ts`)

| Opción | Valor | Notas |
|--------|-------|-------|
| `testDir` | `e2e` | |
| `globalSetup` / `globalTeardown` | `e2e/global-setup.ts`, `e2e/global-teardown.ts` | |
| `workers` | `1` | Evita carreras en BD/UI |
| `timeout` | 120s test / 25s expect | IA y historial usan más en spec |
| `retries` | 1 en CI, 0 local | |
| Env load | `.env.qa` luego `.env` | Sin tocar `.env.local` explícitamente |
| `baseURL` | `PLAYWRIGHT_BASE_URL` o `http://localhost:5173` | |
| `webServer` | `npm run dev` salvo `PLAYWRIGHT_SKIP_WEB_SERVER` | `reuseExistingServer: !CI` |
| Proyecto `setup` | `auth.setup.ts` | Sin storage previo |
| Proyecto `smoke` | `smoke/*.spec.ts` | `storageState: e2e/.auth/user.json`, depende de `setup` |

**Reporters:** `list`, `html` (`playwright-report`), `flow-summary-reporter`.

---

## Autenticación

### Login admin / usuario QA principal

- **Setup:** `e2e/auth.setup.ts` → `loginViaUi` → guarda `e2e/.auth/user.json`.
- **Credenciales:** `QA_USER_EMAIL` + `QA_USER_PASSWORD` (aliases `PLAYWRIGHT_USER_EMAIL` / `PLAYWRIGHT_USER_PASSWORD`).
- **Proyecto smoke:** reutiliza ese `storageState` (sesión “admin/contador con acceso finanzas” según README).

### Login contador (sesión separada)

- **Helper:** `loginAsContador` en `e2e/helpers/auth.ts`.
- **Variables:** `CONTADOR_EMAIL` / `CONTADOR_PASSWORD` con **defaults en código** (`contador@lamoneda.com` / `lamoneda2026`) si no hay env.
- **Uso:** `08-contador-permissions.spec.ts` hace `test.use({ storageState: { cookies: [], origins: [] } })` y login fresco por test (no usa `.auth/user.json`).

### Usuario de prueba

- No hay factory de usuarios ni múltiples storage states (solo un `user.json`).
- Supabase cleanup usa el **mismo** par QA vía `createQaSupabaseClient()`.

### Guardas de entorno

- `assertNotProduction()`: solo `localhost`, `127.0.0.1`, URLs con `staging` / `dev`.
- **Riesgo:** URL de producción sin esas palabras podría pasar el guard si alguien la pone en `PLAYWRIGHT_BASE_URL` (el check es heurístico, no lista blanca de host prod).

---

## Base de datos / limpieza

### Prefijos y marcadores

| Tipo | Marcador | Registro cleanup |
|------|----------|------------------|
| Gastos | `[QA_AUTO]` en `comentarios` | `registerQaGasto` |
| Vehículos | placa `QA…` / `QA-FLOTA-…` / `QA-KM-…` | `registerQaVehiculo` |
| Kilometraje | `[QA_AUTO]` en `descripcion` | `registerQaKilometraje` |
| Documentación | `[QA_AUTO] doc …` en `comentarios` | `registerQaControlFecha` |

**No hay** prefijo `TEST_`; el estándar del repo es **`[QA_AUTO]`**.

### Qué crean tests (con `QA_ALLOW_DB_WRITES=1`)

| Entidad | Specs | Undo en test | Cleanup global |
|---------|-------|--------------|----------------|
| **Gastos** | `02-gastos`, `08-contador` (contador) | Sí: create/edit/move/delete + undo | API; fallback UI delete gastos |
| **Ingresos** | — | — | — |
| **Vehículos** | `03-flota`, `05-km`, `06-flota` | Delete UI en 06; km crea vehículo auxiliar | API delete si placa QA; FK puede fallar |
| **Kilometraje** | `05-kilometraje` | `undoQaKm` (header Deshacer) en la mayoría | API por `descripcion` QA |
| **control_fechas** | `07-documentacion` | Delete UI | API |
| **vehicle_downtime** | — | — | — |
| **Pendientes** | — | — | — |

### Mecanismo de cleanup

1. **No** hay `afterEach` cleanup (evita borrar mientras el test corre).
2. **`globalTeardown`** llama `cleanupQaEntities()` solo si `QA_ALLOW_DB_WRITES=1`.
3. DELETE API **rechaza** filas sin prefijo QA (defensa en profundidad).
4. Gastos: si API falla y hay `page` en teardown global, no hay page en teardown actual → **solo API en global**; UI delete se usa en helper cuando se pasa `page` (no en global teardown hoy).
5. `markQaEntityCleaned()` evita reintentos tras undo create/delete exitoso.
6. **Sin rollback SQL** ni transacciones: modelo “crear → registrar id → borrar al final”.

### Modo lectura

Sin `QA_ALLOW_DB_WRITES=1`: tests con `skipUnlessQaDbWrites` se **omiten**; siguen corriendo login, dashboard, filtros gastos, IA (si API key), unit tests en 05/08.

---

## Cobertura actual por módulo

| Módulo | Cobertura | Archivo(s) | Notas |
|--------|-----------|------------|-------|
| **Login** | Parcial | `auth.setup.ts`, `01-login-dashboard`, `08` | Setup + dashboard; contador login propio |
| **Inicio** | Mínima | `01` | Solo “Finanzas” visible en `/` |
| **Ingresos** | Solo navegación | `08` | `/finanzas/ingresos` carga, sin CRUD |
| **Gastos** | **Alta** | `02-gastos`, `08-contador` | CRUD categorías, mover, historial, undo |
| **Vehículos / flota** | **Media-alta** | `03-flota`, `05-km`, `06-flota` | Alta, edición, delete, conductor |
| **Conductores** | Indirecta | `06-flota` | Asignar/reasignar si hay conductores vigentes |
| **Documentación** | **Media** | `07-documentacion` | CRUD vencimientos QA |
| **Pendientes** | Ninguna | — | Solo mención en placeholder IA |
| **Disponibilidad operativa** | Ninguna | — | Módulo nuevo sin spec |
| **Utilidad** | Lectura indirecta | `02` | Navega a `/finanzas/inversiones/utilidad` para historial |
| **Copiloto / IA** | **Baja** | `04-ia` | 1 pregunta, depende de backend LLM |
| **Realtime** | Ninguna | — | No asserts de sync en vivo |
| **Undo / deshacer** | **Alta** (gastos/km) | `02` Fase A, `05` | Header + toast Deshacer; verifica Supabase en gastos |

### Duplicidad / fases

- **Flota:** `03-flota` (smoke básico inventario) y `06-flota` (Fase C: editar, eliminar, conductor) — conviven; posible solapamiento en “registrar vehículo”.
- **Kilometraje:** `05` incluye tests unitarios de `buildKilometrajePayload` importando desde `src/` (acoplamiento a código app).

---

## Flujos cubiertos (resumen)

- Autenticación QA → storage state → dashboard.
- Gastos: registrar por categoría financiera, editar, mover categoría, filtrar subtipo, historial completo.
- Gastos: undo create / edit / move; delete con verificación BD.
- Inversión sin vehículo en utilidad.
- Inventario vehículos (listado + alta QA).
- Flota avanzada: editar, eliminar UI, asignar conductor (condicional).
- Kilometraje: validaciones payload, registro, alerta 5000 km, undo.
- Documentación: crear/editar/eliminar vencimiento QA.
- IA: una pregunta de conteo vehículos (lento, externo).
- Contador: permisos montos (unit + UI enmascarado / propio gasto).
- Admin: montos visibles en gastos.

---

## Flujos faltantes (prioridad para nuevos tests globales)

1. **Ingresos** — registrar, editar, undo, cleanup QA (mismo patrón que gastos).
2. **Disponibilidad operativa** — modal/FAB, registro `vehicle_downtime`, sin impacto en utilidad (solo UI + opcional API QA).
3. **Pendientes** — CRUD operativo.
4. **Operaciones hub** — links visibles (post-limpieza UI): disponibilidad, sin valor tiempo.
5. **Utilidad operativa** — solo lectura KPIs (sin mutar cálculos).
6. **Accesos rápidos / FAB** — “Registrar indisponibilidad” (nuevo en app, sin spec).
7. **Configuración / perfil** — sin cards rotas (smoke navegación).
8. **Realtime** — opcional: badge conectado o segundo cliente (alto coste, flaky).
9. **Copiloto** — más casos determinísticos (hoy depende de LLM); alinear con `audit:copilot-router` (unit TS, no Playwright).
10. **Finanzas:** préstamos, aportes, caja negocio (rutas ocultas en UI pero existen).

---

## Riesgos

### Tests que podrían dejar registros reales

| Riesgo | Severidad | Detalle |
|--------|-----------|---------|
| Cleanup incompleto | **Alta** si writes=1 | Vehículos con FK (conductores, gastos, km) pueden fallar DELETE API; queda `cleanup-report.json` |
| Tests sin registry | Media | Si un POST no captura `id` o no llama `registerQaGasto`, el registro QA queda huérfano |
| Contador crea gasto | Media | `08` registra vía `registerGasto` → debería entrar al registry; no hace undo explícito |
| Alerta km deja 1 registro base | Baja | Test `km-alert` hace undo del update pero **no** del registro base (comentario en log: “base km queda en cleanup”) |
| Sin `QA_ALLOW_DB_WRITES` | Baja | No crea datos; IA aún puede consumir cuota API |

### Dependencia de datos reales

| Área | Dependencia |
|------|-------------|
| Inventario / flota | Listados asumen vehículos existentes en tenant |
| Asignar conductor | **Skip** si no hay conductores vigentes |
| Gastos historial | Subtipos/options dependen de catálogo en BD |
| IA | Servicio LLM/config; timeouts 120–180s |
| Contador | Usuario `contador@…` debe existir en Supabase auth + profile |
| Permisos RLS | Cleanup y inserts usan anon + sesión QA |

### Riesgo producción

- Guard URL **no es infalible** (heurística staging/dev).
- **Defaults hardcoded** de contador en `auth.ts` si se corre contra BD compartida real.
- `QA_ALLOW_DB_WRITES=1` contra proyecto Supabase compartido con datos de negocio: borrado solo protegido por prefijo, pero **un bug en assert podría ser grave** (hoy hay checks en cleanup).
- Suite **no** debe apuntar a prod; README lo dice; falta enforcement por `VITE_SUPABASE_URL` prod.

### Lentitud / inestabilidad

| Spec | Motivo |
|------|--------|
| `04-ia` | 180s, respuesta LLM variable |
| `02` historial completo / mover | 90–120s, UI pesada |
| `07-documentacion` | 180s, “historial completo” |
| `05` alerta km | 180s, dos registros + undo parcial |
| Serial + 1 worker | Suite total larga pero predecible |
| Selectores UI frágiles | `span:text-is`, tabs categoría, tablas grandes |

---

## Recomendación de arquitectura segura

1. **Entorno dedicado:** Supabase DEV exclusivo + `.env.qa` local; nunca credenciales prod en `.env.qa`.
2. **Doble guard:** extender `assertNotProduction` a validar `VITE_SUPABASE_URL` (denylist hosts prod).
3. **Un solo usuario storage + proyectos opcionales** `smoke-read` vs `smoke-write` (write requiere flag).
4. **Patrón único de datos:** siempre `[QA_AUTO]` + `registerQa*` + verificación pre-delete; extender registry a `ingreso`, `vehicle_downtime`, `pendiente` cuando se añadan tests.
5. **Preferir undo + `markQaEntityCleaned`** para create, y delete explícito al final de spec serial si hace falta estado limpio entre tests.
6. **No cleanup en `afterEach`** (mantener); opcional `cleanupQaEntities({ testKey })` solo en describe serial largo si se aísla por archivo.
7. **Fixtures:** seguir `e2e/fixtures/console.ts`; añadir fixture `qaWrite` que haga skip automático.
8. **IA / copiloto:** tests Playwright mínimos (pantalla carga); regresión router en `npm run audit:copilot-router` (unit), no en E2E LLM.
9. **Disponibilidad operativa:** tests con `vehicle_downtime` usando comentario `[QA_AUTO]` y tabla en registry nueva antes de writes masivos.
10. **Documentar** en `e2e/README.md` archivos 05–08 y módulos no cubiertos (este informe como fuente).

---

## Plan propuesto (sin implementar)

### Capa 1 — Smoke lectura (sin `QA_ALLOW_DB_WRITES`)

- Login + inicio + navegación secciones principales (Operaciones sin valor tiempo, Disponibilidad carga).
- Gastos/ingresos: páginas cargan, modales abren, **sin guardar**.
- Configuración: sin cards rotas; admin ve historial si aplica.
- FAB: abre menú y “Registrar indisponibilidad” abre modal (sin guardar si no hay writes).

### Capa 2 — Smoke escritura QA (con flag + registry)

- **Ingresos:** create con `[QA_AUTO]` → registry `ingreso` → cleanup API (nuevo helper espejo de gastos).
- **Disponibilidad:** create downtime activo/cerrado, placa vehículo QA existente, cleanup por id + comentario.
- **Pendientes:** create con tag QA, delete/cierre.
- Mantener **gastos/km/doc/flota** como regresión serial existente.

### Capa 3 — E2E críticos con undo

- Gastos/ingresos/km: camino feliz + **undo create** + assert ausencia en Supabase (patrón `02` Fase A).
- Mover categoría / editar: solo en describe serial dedicado.
- **No** mezclar undo y delete en el mismo test sin `markQaEntityCleaned`.

### Capa 4 — Tests sin ensuciar BD

- Unit en helpers (`buildKilometrajePayload` ya existe).
- Permisos (`08` unit).
- Navegación contador/admin sin POST.
- Snapshot ligero de textos KPI utilidad (sin comparar montos con golden files de prod).

### Capa 5 — Cleanup seguro (evolución)

- Ampliar `QaEntityKind`: `ingreso`, `vehicle_downtime`, `pendiente`.
- Orden de delete respetando FK (downtime → km → gastos → vehículo).
- Teardown: fallar suite si `cleanup-report.json` tiene `failed.length > 0` (opt-in CI).
- Script manual `npm run qa:cleanup` (futuro) que lea registry sin correr tests.

### Capa 6 — Excluido o mínimo

- **Realtime:** no E2E salvo prueba manual.
- **Copiloto LLM:** 0–1 smoke; router en audit TS.
- **Producción:** nunca en pipeline; solo DEV CI con secrets de staging.

### Orden sugerido de implementación

1. Actualizar `e2e/README.md` + registry tipos para downtime/ingreso.  
2. Smoke lectura nuevos módulos (disponibilidad, FAB, config).  
3. Ingresos write + cleanup.  
4. Downtime write + cleanup.  
5. Ampliar guards Supabase URL.  
6. Revisar duplicado `03` vs `06` flota.

---

## Notas sobre documentación existente

- `e2e/README.md` lista solo suites 01–04; faltan **05-kilometraje**, **06-flota**, **07-documentacion**, **08-contador-permissions**.
- No se ejecutaron tests en esta auditoría; conclusiones por **lectura estática** del repo.

---

## Comandos de referencia (cuando se autorice ejecución)

```bash
npx playwright install chromium
# Cargar .env.qa según README
npm run test:e2e          # lectura + setup
# QA_ALLOW_DB_WRITES=1    # mutaciones + cleanup
npm run test:e2e:report
```
