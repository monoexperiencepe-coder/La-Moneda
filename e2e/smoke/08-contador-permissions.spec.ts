import { test, expect } from '@playwright/test';
import {
  AMOUNT_VISIBILITY_WINDOW_MS,
  canViewAmountForRecord,
  canViewAmountsGlobal,
  canAccessAI,
  MASKED_AMOUNT_PEN,
} from '../../src/utils/amountPermissions';
import { assertNotProduction, qaDbWritesEnabled, qaTag, skipUnlessQaDbWrites } from '../helpers/qa';
import { loginAsContador, loginViaUi } from '../helpers/auth';
import { openRegistrarGastoModal, registerGasto, expectGastoVisibleInHistorial, enterGastosCategoriaTab, waitForGastosPageReady } from '../helpers/gastos-form';

test.describe('Unit · amountPermissions 24h', () => {
  const userId = 'contador-user-id';
  const now = Date.parse('2026-05-31T12:00:00.000Z');

  test('admin siempre ve montos', () => {
    expect(
      canViewAmountForRecord({
        role: 'admin',
        userId: 'x',
        recordCreatedBy: 'y',
        recordCreatedAt: '2020-01-01T00:00:00.000Z',
        nowMs: now,
      }),
    ).toBe(true);
  });

  test('contador ve propio registro dentro de 24h', () => {
    const createdAt = new Date(now - 23 * 60 * 60 * 1000).toISOString();
    expect(
      canViewAmountForRecord({
        role: 'contador',
        userId,
        recordCreatedBy: userId,
        recordCreatedAt: createdAt,
        nowMs: now,
      }),
    ).toBe(true);
  });

  test('contador no ve propio registro después de 24h', () => {
    const createdAt = new Date(now - 25 * 60 * 60 * 1000).toISOString();
    expect(
      canViewAmountForRecord({
        role: 'contador',
        userId,
        recordCreatedBy: userId,
        recordCreatedAt: createdAt,
        nowMs: now,
      }),
    ).toBe(false);
  });

  test('contador no ve registro ajeno aunque sea reciente', () => {
    const createdAt = new Date(now - 1 * 60 * 60 * 1000).toISOString();
    expect(
      canViewAmountForRecord({
        role: 'contador',
        userId,
        recordCreatedBy: 'otro-usuario',
        recordCreatedAt: createdAt,
        nowMs: now,
      }),
    ).toBe(false);
  });

  test('ventana 24h en ms', () => {
    expect(AMOUNT_VISIBILITY_WINDOW_MS).toBe(86_400_000);
  });

  test('roles globales e IA', () => {
    expect(canViewAmountsGlobal('contador')).toBe(false);
    expect(canViewAmountsGlobal('admin')).toBe(true);
    expect(canAccessAI('contador')).toBe(false);
    expect(canAccessAI('socio')).toBe(true);
  });
});

test.describe('Smoke · Contador permisos montos', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test.use({ storageState: { cookies: [], origins: [] } });

  test('login y navegación amplia sin IA', async ({ page }) => {
    await loginAsContador(page);
    await page.goto('/');
    await expect(page.getByText('Finanzas').first()).toBeVisible({ timeout: 30_000 });

    for (const path of [
      '/finanzas/gastos',
      '/finanzas/ingresos',
      '/vehiculos/inventario',
      '/operaciones/mantenimiento',
      '/operaciones/docs',
    ]) {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login/);
    }

    await page.goto('/asistente');
    await expect(page.getByText(/Acceso restringido|No tienes permiso/i).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.goto('/finanzas/ia-clasificacion');
    await expect(page.getByText(/Acceso restringido|No tienes permiso/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('no ve totales globales; ve monto propio reciente en fila', async ({ page }) => {
    skipUnlessQaDbWrites(test);
    test.setTimeout(180_000);

    await loginAsContador(page);
    await page.goto('/finanzas/gastos');
    await waitForGastosPageReady(page);

    await expect(page.getByText(MASKED_AMOUNT_PEN).first()).toBeVisible({ timeout: 45_000 });

    const tag = qaTag('contador-gasto');
    await openRegistrarGastoModal(page);
    const { id } = await registerGasto(page, {
      categoria: 'administrativo_empresa',
      comentarios: tag,
      monto: '123.45',
    });
    await enterGastosCategoriaTab(page, 'Administrativos');
    await expectGastoVisibleInHistorial(page, tag, { gastoId: id });

    const row = page.locator('tr').filter({ hasText: tag }).first();
    await expect(row).toContainText('123.45');

    const maskedRows = page.locator('tr').filter({ hasText: MASKED_AMOUNT_PEN });
    expect(await maskedRows.count()).toBeGreaterThan(0);
  });
});

test.describe('Smoke · Admin montos visibles', () => {
  test.beforeAll(() => {
    assertNotProduction();
  });

  test.use({ storageState: { cookies: [], origins: [] } });

  test('admin QA sigue viendo montos en gastos', async ({ page }) => {
    if (!qaDbWritesEnabled()) {
      test.skip(true, 'Requiere QA_ALLOW_DB_WRITES=1');
    }
    await loginViaUi(page);
    await page.goto('/finanzas/gastos');
    await waitForGastosPageReady(page);
    await expect(page.getByText(MASKED_AMOUNT_PEN).first()).toBeHidden({ timeout: 45_000 }).catch(() => undefined);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/S\/\s[\d,]+\.\d{2}/);
  });
});
