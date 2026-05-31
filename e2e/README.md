# QA E2E — La Moneda (Playwright)

Smoke tests de los flujos principales del ERP. **Solo DEV/staging** (nunca producción).

## Requisitos

1. Node 20+
2. Supabase DEV con datos de prueba
3. Copiar `.env.qa.example` → `.env.qa` y completar credenciales

## Variables

| Variable | Descripción |
|----------|-------------|
| `QA_ALLOW_DB_WRITES` | **`1`** obligatorio para tests que crean gastos/vehículos QA |
| `PLAYWRIGHT_BASE_URL` | URL de la app (default `http://localhost:5173`). Solo localhost/staging/dev |
| `QA_USER_EMAIL` | Usuario admin/contador con acceso finanzas |
| `QA_USER_PASSWORD` | Contraseña |
| `VITE_SUPABASE_URL` | Supabase (cleanup automático por API) |
| `VITE_SUPABASE_ANON_KEY` | Anon key |
| `VITE_EMPRESA_ID` | Opcional si el perfil QA ya tiene `empresa_id` |
| `PLAYWRIGHT_SKIP_WEB_SERVER` | `1` si ya corre `npm run dev` |

Cargar env antes de correr (PowerShell):

```powershell
Get-Content .env.qa | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}
```

## Modo seguro

- Sin `QA_ALLOW_DB_WRITES=1`: se ejecutan tests de **lectura** (login, listados, IA, filtros).
- Tests que **crean** data en BD se omiten automáticamente.
- `PLAYWRIGHT_BASE_URL` fuera de localhost/staging/dev **aborta** la suite.

## Cleanup automático

1. Cada registro QA lleva prefijo **`[QA_AUTO]`** (comentarios, modelo, placa `QA…`).
2. Al crear un gasto/vehículo se guarda el **id** en `e2e/.qa-artifacts/registry.json`.
3. Al **final de la suite** (`globalTeardown`) se borran todos los registros QA pendientes por API Supabase (RLS del usuario QA). No hay cleanup en `afterEach` — evita borrar data mientras el test aún corre.
4. Gastos: fallback por UI (buscar tag → Eliminar) si falla la API.
5. Vehículos: solo API; si falla, queda en `e2e/.qa-artifacts/cleanup-report.json`.

## Scripts

```bash
npm install
npx playwright install chromium
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:report
```

## Reportes

- Consola: resumen por flujo (pasó / falló / duración)
- HTML: `playwright-report/index.html`
- Fallos: screenshot + trace + `browser-console.txt` en `test-results/`
- Cleanup incompleto: `e2e/.qa-artifacts/cleanup-report.json` + adjunto `qa-cleanup-failed.json` por test

## Suites

| Archivo | Flujos |
|---------|--------|
| `auth.setup.ts` | Login → `e2e/.auth/user.json` |
| `smoke/01-login-dashboard.spec.ts` | Dashboard |
| `smoke/02-gastos.spec.ts` | Registro, edición, mover, historial |
| `smoke/03-flota.spec.ts` | Inventario, vehículo, conductor |
| `smoke/04-ia.spec.ts` | Asistente IA |
