import { expect, type Locator, type Page, type Response } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { registerQaGasto } from './qa-registry';
import { qaDbWritesEnabled } from './qa';
import { verifyQaGastoInSupabase } from './qa-supabase';

const GASTOS_SEARCH_PLACEHOLDER = /Buscar gastos/i;
const GASTOS_REST_PATH = /\/rest\/v1\/gastos/;

const QA_ROW_MISSING_MSG = 'QA row was not created or not visible';
const HISTORIAL_ROW_TIMEOUT_MS = 15_000;
const HISTORIAL_SEARCH_TIMEOUT_MS = 20_000;

export function qaTestLog(step: string): void {
  // eslint-disable-next-line no-console
  console.log(`[QA TEST] ${step}`);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type GastoCategoriaUi =
  | 'administrativo_empresa'
  | 'financiero_prestamo'
  | 'operativo_vehiculo'
  | 'operativo_flota_general'
  | 'inversion_compra';

export type RegistroModalTipo = 'gasto' | 'inversion';

export type SelectOptionRow = { value: string; label: string; text: string };

const CATEGORIA_FINANCIERA_SELECTOR = '#expense-field-categoria-financiera';

/** Values reales de `FINANZA_GASTO_REGISTRO_OPTIONS` (sin depender de emoji en label). */
export const CATEGORIA_FINANCIERA_VALUES: Record<GastoCategoriaUi, string> = {
  administrativo_empresa: 'administrativo_empresa',
  financiero_prestamo: 'financiero_prestamo',
  operativo_vehiculo: 'operativo_vehiculo',
  operativo_flota_general: 'operativo_flota_general',
  inversion_compra: 'inversion_compra',
};

const SUBTIPO_PREFS: Record<
  GastoCategoriaUi,
  { selector: string; preferredValues: string[] }
> = {
  administrativo_empresa: {
    selector: '#expense-field-subtipo-administrativo',
    preferredValues: ['SUNAT', 'OFICINA', 'administrativo_general'],
  },
  financiero_prestamo: {
    selector: '#expense-field-subtipo-financiero',
    preferredValues: ['PRÉSTAMO', 'PRESTAMO', 'INTERESES'],
  },
  operativo_vehiculo: {
    selector: '#expense-field-subtipo-operativo',
    preferredValues: ['MOTOR TALLER', 'GNV TALLER', 'motor', 'gnv'],
  },
  operativo_flota_general: {
    selector: '#expense-field-subtipo-operativo',
    preferredValues: ['COMBUSTIBLE', 'DOCUMENTOS', 'OTROS / ESPECIFICAR'],
  },
  inversion_compra: {
    selector: '#expense-field-subtipo-inversion',
    preferredValues: ['adquisicion_vehiculo', 'Adquisición de vehículo'],
  },
};

function normKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function formatSelectOptions(options: SelectOptionRow[]): string {
  const usable = options.filter((o) => o.value.trim() !== '' || o.text.trim() !== '');
  if (usable.length === 0) return '(vacío)';
  return usable
    .map((o) => `{ value: "${o.value}", label: "${o.label}", text: "${o.text}" }`)
    .join('; ');
}

export async function readSelectOptions(locator: Locator): Promise<SelectOptionRow[]> {
  await locator.waitFor({ state: 'visible', timeout: 20_000 });
  return locator.evaluate((el) =>
    Array.from((el as HTMLSelectElement).options).map((o) => ({
      value: o.value,
      label: o.label,
      text: (o.textContent ?? '').trim(),
    })),
  );
}

function findOptionMatch(options: SelectOptionRow[], needle: string): SelectOptionRow | null {
  const nk = normKey(needle);
  const usable = options.filter((o) => o.value.trim() !== '');
  return (
    usable.find((o) => normKey(o.value) === nk)
    ?? usable.find((o) => normKey(o.label) === nk)
    ?? usable.find((o) => normKey(o.text) === nk)
    ?? usable.find((o) => normKey(o.text).includes(nk) || normKey(o.label).includes(nk))
    ?? null
  );
}

function resolveOptionValue(
  options: SelectOptionRow[],
  preferredValues: string[],
  context: string,
): string {
  const usable = options.filter((o) => o.value.trim() !== '');
  for (const pref of preferredValues) {
    const hit = findOptionMatch(usable, pref);
    if (hit) return hit.value;
  }
  throw new Error(`${context} no encontrada. Opciones disponibles: ${formatSelectOptions(options)}`);
}

export async function selectOptionByValue(
  locator: Locator,
  value: string,
  context: string,
): Promise<void> {
  const options = await readSelectOptions(locator);
  const hit = options.find((o) => o.value === value);
  if (!hit || !value.trim()) {
    // eslint-disable-next-line no-console
    console.error(`[e2e:gastos] ${context} — value "${value}" no encontrado`, options);
    throw new Error(
      `${context} no encontrada. Opciones disponibles: ${formatSelectOptions(options)}`,
    );
  }
  await locator.selectOption(value);
}

export async function selectOptionWithPreferences(
  locator: Locator,
  preferredValues: string[],
  context: string,
): Promise<void> {
  const options = await readSelectOptions(locator);
  try {
    const value = resolveOptionValue(options, preferredValues, context);
    await locator.selectOption(value);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[e2e:gastos] ${context}`, options);
    throw err;
  }
}

/** Selecciona categoría financiera por value canónico (ej. administrativo_empresa). */
export async function selectCategoriaGasto(page: Page, categoria: GastoCategoriaUi): Promise<void> {
  if (categoria === 'inversion_compra') return;
  const locator = page.locator(CATEGORIA_FINANCIERA_SELECTOR);
  const value = CATEGORIA_FINANCIERA_VALUES[categoria];
  await selectOptionByValue(locator, value, `Categoría financiera (${value})`);
}

export async function selectSubtipoGasto(page: Page, categoria: GastoCategoriaUi): Promise<void> {
  const cfg = SUBTIPO_PREFS[categoria];
  const locator = page.locator(cfg.selector);
  await locator.waitFor({ state: 'visible', timeout: 20_000 });
  await selectOptionWithPreferences(
    locator,
    cfg.preferredValues,
    `Subtipo (${categoria})`,
  );
}

async function selectFirstVehicle(page: Page): Promise<void> {
  const veh = page.locator('#expense-field-vehicle');
  await veh.waitFor({ state: 'visible', timeout: 15_000 });
  const options = await readSelectOptions(veh);
  const usable = options.filter((o) => o.value.trim() !== '');
  if (usable.length === 0) {
    throw new Error(
      `N° vehículo: sin opciones en select. Disponibles: ${formatSelectOptions(options)}`,
    );
  }
  await veh.selectOption(usable[0].value);
}

export function registroModalTipoFromCategoria(categoria: GastoCategoriaUi): RegistroModalTipo {
  return categoria === 'inversion_compra' ? 'inversion' : 'gasto';
}

export function getRegistrarDialog(page: Page, tipo: RegistroModalTipo) {
  return tipo === 'inversion'
    ? page.getByRole('dialog', { name: /Registrar inversión/i })
    : page.getByRole('dialog', { name: 'Registrar gasto' });
}

async function pickMetodoPagoEfectivo(page: Page, tipo: RegistroModalTipo): Promise<void> {
  const modal = getRegistrarDialog(page, tipo);
  await modal.getByRole('button', { name: 'Efectivo', exact: true }).click();
  const cuentaBtn = modal.locator('#expense-field-metodo-cuenta button').first();
  if (await cuentaBtn.isVisible().catch(() => false)) {
    await cuentaBtn.click();
  }
}

function isSuccessfulGastoInsertResponse(resp: { url(): string; request(): { method(): string }; status(): number }): boolean {
  return (
    GASTOS_REST_PATH.test(resp.url()) &&
    resp.request().method() === 'POST' &&
    resp.status() >= 200 &&
    resp.status() < 300
  );
}

function isGastosHistorialFetch(resp: { url(): string; request(): { method(): string }; status(): number }): boolean {
  return GASTOS_REST_PATH.test(resp.url()) && resp.request().method() === 'GET' && resp.status() === 200;
}

/** Espera POST exitoso a `gastos` y valida que el comentario QA llegó al backend. */
export async function waitForGastoInsertSuccess(
  page: Page,
  comentarios: string,
  responsePromise: Promise<Response>,
): Promise<{ id?: string; comentarios?: string }> {
  const resp = await responsePromise;
  let body: Record<string, unknown> | null = null;
  try {
    body = (await resp.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!body || typeof body !== 'object') {
    throw new Error(`Gasto QA no se creó: respuesta POST vacía o inválida (status ${resp.status()}).`);
  }
  const savedComentarios = typeof body.comentarios === 'string' ? body.comentarios : '';
  if (savedComentarios !== comentarios) {
    throw new Error(
      `Gasto QA insertado pero comentarios no coinciden. Esperado: "${comentarios}". Recibido: "${savedComentarios}".`,
    );
  }
  const id = body.id != null ? String(body.id) : undefined;
  if (id) registerQaGasto(id, comentarios);
  return { id, comentarios: savedComentarios };
}

async function submitRegistrarModal(
  page: Page,
  tipo: RegistroModalTipo,
  comentarios: string,
): Promise<{ id?: string; comentarios: string }> {
  const modal = getRegistrarDialog(page, tipo);
  const submitLabel = tipo === 'inversion' ? 'Registrar inversión' : 'Registrar gasto';
  const insertResponse = page.waitForResponse(isSuccessfulGastoInsertResponse, { timeout: 60_000 });
  await modal.getByRole('button', { name: submitLabel, exact: true }).click();
  const created = await waitForGastoInsertSuccess(page, comentarios, insertResponse);
  await page
    .getByText(/Gasto registrado/i)
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
    .catch(() => undefined);
  await modal.waitFor({ state: 'hidden', timeout: 60_000 });
  return created;
}

const REGISTRAR_GASTO_BUTTON = '+ Registrar';

async function captureOpenRegistrarDiagnostics(page: Page, context: string): Promise<string> {
  const dir = path.join(process.cwd(), 'test-results');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = Date.now();
  const screenshotPath = path.join(dir, `open-registrar-failed-${stamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  const url = page.url();
  const mainHtml = await page.locator('main').first().innerHTML().catch(() => '(main no encontrado)');
  const htmlPath = path.join(dir, `open-registrar-main-${stamp}.html`);
  fs.writeFileSync(htmlPath, mainHtml, 'utf8');
  const buttons = await page.getByRole('button').all();
  const visibleButtons: string[] = [];
  for (const btn of buttons) {
    if (await btn.isVisible().catch(() => false)) {
      const name = (await btn.innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
      if (name) visibleButtons.push(name);
    }
  }
  const registrarMatches = await page.getByRole('button', { name: REGISTRAR_GASTO_BUTTON, exact: true }).count();
  return [
    `openRegistrarGastoModal failed (${context})`,
    `url=${url}`,
    `registrarExactMatches=${registrarMatches}`,
    `screenshot=${screenshotPath}`,
    `mainHtml=${htmlPath}`,
    `visibleButtons=${visibleButtons.join(' | ') || '(ninguno)'}`,
  ].join('\n');
}

/** Espera parrilla/detalle de gastos estable (header visible, sin overlay bloqueante). */
export async function waitForGastosPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('heading', { name: /Gastos/i }).waitFor({ state: 'visible', timeout: 60_000 });

  const blockingOverlay = page.locator('[aria-label="Cargando gastos"]');
  if (await blockingOverlay.isVisible().catch(() => false)) {
    await blockingOverlay.waitFor({ state: 'hidden', timeout: 60_000 });
  }

  const busyStatus = page.locator('[role="status"][aria-busy="true"]');
  const busyCount = await busyStatus.count();
  for (let i = 0; i < busyCount; i++) {
    const el = busyStatus.nth(i);
    if (await el.isVisible().catch(() => false)) {
      await el.waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => undefined);
    }
  }
}

async function clickRegistrarGastoButton(page: Page): Promise<void> {
  const registrarButton = page.getByRole('button', { name: REGISTRAR_GASTO_BUTTON, exact: true });
  try {
    await expect(registrarButton).toBeVisible({ timeout: 60_000 });
    await expect(registrarButton).toBeEnabled({ timeout: 60_000 });
    await registrarButton.click();
  } catch (err) {
    const matchCount = await registrarButton.count();
    if (matchCount > 1) {
      try {
        await expect(registrarButton.first()).toBeVisible({ timeout: 5_000 });
        await expect(registrarButton.first()).toBeEnabled({ timeout: 5_000 });
        await registrarButton.first().click();
        return;
      } catch {
        // cae al diagnóstico completo
      }
    }
    const diag = await captureOpenRegistrarDiagnostics(
      page,
      matchCount === 0 ? 'botón no encontrado' : `click falló · matches=${matchCount}`,
    );
    throw new Error(`${diag}\n\nOriginal: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function openRegistrarGastoModal(
  page: Page,
  opts?: {
    tipo?: RegistroModalTipo;
    /** @deprecated Usar `tipo: 'inversion'` */
    inversion?: boolean;
    /** No recargar /finanzas/gastos si ya estamos ahí (preserva undo en header). */
    skipNavigation?: boolean;
  },
): Promise<void> {
  const tipo: RegistroModalTipo =
    opts?.tipo ?? (opts?.inversion ? 'inversion' : 'gasto');

  if (tipo === 'inversion') {
    if (!opts?.skipNavigation) {
      await page.goto('/finanzas/inversiones/utilidad');
    }
    await page.getByRole('button', { name: '+ Registrar inversión', exact: true }).click();
    await getRegistrarDialog(page, 'inversion').waitFor({ state: 'visible', timeout: 20_000 });
    return;
  }

  if (!opts?.skipNavigation) {
    await page.goto('/finanzas/gastos');
  }
  await waitForGastosPageReady(page);
  await clickRegistrarGastoButton(page);
  await getRegistrarDialog(page, 'gasto').waitFor({ state: 'visible', timeout: 60_000 });
}

/** Registra un gasto completo en el modal abierto. */
export async function registerGasto(
  page: Page,
  opts: {
    categoria: GastoCategoriaUi;
    comentarios: string;
    monto?: string;
    skipVehicle?: boolean;
  },
): Promise<{ id: string; comentarios: string }> {
  const { categoria, comentarios, monto = '12.50', skipVehicle = false } = opts;

  if (categoria !== 'inversion_compra') {
    await selectCategoriaGasto(page, categoria);
  }

  await selectSubtipoGasto(page, categoria);

  if (categoria === 'operativo_vehiculo' && !skipVehicle) {
    await selectFirstVehicle(page);
  }

  const modalTipo = registroModalTipoFromCategoria(categoria);

  await page.locator('#expense-field-monto').fill(monto);
  await page.getByPlaceholder('Notas adicionales…').fill(comentarios);
  await pickMetodoPagoEfectivo(page, modalTipo);
  const created = await submitRegistrarModal(page, modalTipo, comentarios);
  if (!created.id) {
    throw new Error('registerGasto: insert OK pero sin id en respuesta');
  }
  // eslint-disable-next-line no-console
  console.info(`[QA_AUTO] gasto creado OK · id=${created.id}`);
  return { id: created.id, comentarios: created.comentarios ?? comentarios };
}

/** @deprecated Usar registerGasto */
export const fillAndSubmitGasto = registerGasto;

export function getHistorialSearchInput(page: Page) {
  return page.getByPlaceholder(GASTOS_SEARCH_PLACEHOLDER);
}

/** Término único para búsqueda server-side (timestamp del tag QA). */
export function pickHistorialSearchTerm(tag: string): string {
  const parts = tag.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? tag;
  if (/^\d{10,}$/.test(last)) return last;
  return tag;
}

function historialFetchMatchesSearch(url: string, searchTerm: string): boolean {
  if (!GASTOS_REST_PATH.test(url)) return false;
  const decoded = decodeURIComponent(url);
  return decoded.toLowerCase().includes(encodeURIComponent(searchTerm).toLowerCase())
    || decoded.toLowerCase().includes(searchTerm.toLowerCase());
}

/** Espera que el bloque historial termine de cargar (vista rápida paginada). */
export async function waitForHistorialUiReady(page: Page): Promise<void> {
  const loading = page.getByText(/Cargando historial/i);
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: 'hidden', timeout: HISTORIAL_SEARCH_TIMEOUT_MS });
  }
  await page
    .getByRole('heading', { name: /Historial ·/i })
    .waitFor({ state: 'visible', timeout: HISTORIAL_SEARCH_TIMEOUT_MS });
  await page
    .locator('#copilot-gastos-table, [aria-label="Cargando historial"]')
    .first()
    .waitFor({ state: 'attached', timeout: HISTORIAL_SEARCH_TIMEOUT_MS })
    .catch(() => undefined);
}

export type HistorialSearchDiagnostics = {
  tag: string;
  searchTerm: string;
  gastoId?: string;
  url: string;
  categoriaActiva: string | null;
  totalRowsText: string | null;
  totalRowsInTable: number;
  filters: {
    year: string | null;
    month: string | null;
    subtipo: string | null;
  };
  historialScope: 'rapido' | 'completo' | 'unknown';
  serverSearchActive: boolean;
  searchInputValue: string | null;
  currentPageText: string | null;
  dbVerify: Awaited<ReturnType<typeof verifyQaGastoInSupabase>> | null;
  found: boolean;
  locatorCount: { table: number; role: number };
  locatorText: { table: string | null; role: string | null };
};

export type GastoHistorialRowProbe = {
  searchTerm: string;
  tableCount: number;
  roleCount: number;
  tableText: string | null;
  roleText: string | null;
  found: boolean;
  activeRow: Locator;
};

/** Locators canónicos — misma fuente para diagnostics, expect y clicks. */
export function getGastoHistorialRowLocators(page: Page, tag: string) {
  const searchTerm = pickHistorialSearchTerm(tag);
  const pattern = new RegExp(escapeRegExp(searchTerm));
  const byTable = page.locator('#copilot-gastos-table tbody tr').filter({ hasText: pattern });
  const byRole = page.getByRole('row', { name: pattern });
  return { searchTerm, pattern, byTable, byRole };
}

/** Detecta fila QA con ambos locators; `found` = fila visible en tabla o por role. */
export async function probeGastoHistorialRow(page: Page, tag: string): Promise<GastoHistorialRowProbe> {
  const { searchTerm, byTable, byRole } = getGastoHistorialRowLocators(page, tag);
  const tableCount = await byTable.count();
  const roleCount = await byRole.count();
  const tableText =
    tableCount > 0 ? ((await byTable.first().textContent().catch(() => null))?.trim() ?? null) : null;
  const roleText =
    roleCount > 0 ? ((await byRole.first().textContent().catch(() => null))?.trim() ?? null) : null;
  const tableVisible =
    tableCount > 0 && (await byTable.first().isVisible().catch(() => false));
  const roleVisible = roleCount > 0 && (await byRole.first().isVisible().catch(() => false));
  const found = tableVisible || roleVisible;
  const activeRow = tableVisible ? byTable.first() : roleVisible ? byRole.first() : byTable.first();
  return {
    searchTerm,
    tableCount,
    roleCount,
    tableText,
    roleText,
    found,
    activeRow,
  };
}

async function logQaLocatorProbe(page: Page, tag: string, probe?: GastoHistorialRowProbe): Promise<void> {
  const row = getGastoHistorialRowLocators(page, tag).byTable;
  // eslint-disable-next-line no-console
  console.log('[QA LOCATOR COUNT]', await row.count());
  // eslint-disable-next-line no-console
  console.log('[QA LOCATOR TEXT]', await row.first().textContent());
  if (probe) {
    // eslint-disable-next-line no-console
    console.log('[QA LOCATOR ROLE COUNT]', probe.roleCount);
  }
}

export async function collectHistorialSearchDiagnostics(
  page: Page,
  tag: string,
  opts?: { gastoId?: string; probe?: GastoHistorialRowProbe },
): Promise<HistorialSearchDiagnostics> {
  const probe = opts?.probe ?? (await probeGastoHistorialRow(page, tag));
  const searchTerm = probe.searchTerm;
  let dbVerify: HistorialSearchDiagnostics['dbVerify'] = null;
  if (opts?.gastoId && qaDbWritesEnabled()) {
    try {
      dbVerify = await verifyQaGastoInSupabase(opts.gastoId, tag);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[QA ROW SEARCH] dbVerify error', err);
    }
  }

  const historialCompleto = await page.getByRole('button', { name: 'Vista rápida' }).isVisible().catch(() => false);
  const historialRapido = await page.getByRole('button', { name: 'Ver historial completo' }).isVisible().catch(() => false);

  return {
    tag,
    searchTerm,
    gastoId: opts?.gastoId,
    url: page.url(),
    categoriaActiva: await page.getByRole('heading', { name: /Historial ·/i }).first().textContent().catch(() => null),
    totalRowsText: await page.getByText(/registros en esta categoría/i).first().textContent().catch(() => null),
    totalRowsInTable: await page.locator('#copilot-gastos-table tbody tr').count().catch(() => 0),
    filters: {
      year: await page.getByLabel('Historial — año').inputValue().catch(() => null),
      month: await page.getByLabel('Historial — mes').inputValue().catch(() => null),
      subtipo: await page.getByLabel('Filtrar por subtipo').inputValue().catch(() => null),
    },
    historialScope: historialCompleto ? 'completo' : historialRapido ? 'rapido' : 'unknown',
    serverSearchActive: await page.getByText(/búsqueda en servidor/i).isVisible().catch(() => false),
    searchInputValue: await getHistorialSearchInput(page).inputValue().catch(() => null),
    currentPageText: await page.getByText(/Página \d+ de \d+/i).first().textContent().catch(() => null),
    dbVerify,
    found: probe.found,
    locatorCount: { table: probe.tableCount, role: probe.roleCount },
    locatorText: { table: probe.tableText, role: probe.roleText },
  };
}

/** Filtra historial por tag QA vía buscador (server-side tras debounce ~400ms). */
export async function searchGastoHistorial(
  page: Page,
  tag: string,
  _opts?: { gastoId?: string },
): Promise<void> {
  await waitForHistorialUiReady(page);

  const searchTerm = pickHistorialSearchTerm(tag);
  const search = getHistorialSearchInput(page);
  await expect(search).toBeVisible({ timeout: HISTORIAL_ROW_TIMEOUT_MS });

  await search.fill(searchTerm);

  await page
    .getByText(/búsqueda en servidor/i)
    .waitFor({ state: 'visible', timeout: 10_000 })
    .catch(() => undefined);

  await page
    .waitForResponse(
      (resp) =>
        resp.request().method() === 'GET' &&
        isGastosHistorialFetch(resp) &&
        historialFetchMatchesSearch(resp.url(), searchTerm),
      { timeout: HISTORIAL_SEARCH_TIMEOUT_MS },
    )
    .catch(() =>
      page.waitForResponse(isGastosHistorialFetch, { timeout: 10_000 }).catch(() => undefined),
    );

  const loading = page.getByText(/Cargando historial/i);
  if (await loading.isVisible().catch(() => false)) {
    await loading.waitFor({ state: 'hidden', timeout: HISTORIAL_SEARCH_TIMEOUT_MS });
  }
}

async function captureQaRowDiagnostics(page: Page, tag: string, context: string): Promise<string> {
  const dir = path.join(process.cwd(), 'test-results');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = Date.now();
  const screenshotPath = path.join(dir, `qa-row-missing-${stamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  const table = page.locator('#copilot-gastos-table table, #copilot-gastos-table tbody, table').first();
  const tableHtml = await table.innerHTML().catch(async () =>
    page.locator('#copilot-gastos-table').innerHTML().catch(() => '(tabla no encontrada)'),
  );
  const htmlPath = path.join(dir, `qa-row-missing-${stamp}.html`);
  fs.writeFileSync(htmlPath, tableHtml, 'utf8');
  return [
    QA_ROW_MISSING_MSG,
    `context=${context}`,
    `tag=${tag}`,
    `screenshot=${screenshotPath}`,
    `tableHtml=${htmlPath}`,
  ].join(' · ');
}

export function getGastoHistorialRow(page: Page, tag: string, _opts?: { gastoId?: string }): Locator {
  return getGastoHistorialRowLocators(page, tag).byTable.first();
}

async function finishGastoRowFound(
  page: Page,
  tag: string,
  probe: GastoHistorialRowProbe,
  opts?: { gastoId?: string },
): Promise<void> {
  await logQaLocatorProbe(page, tag, probe);
  // eslint-disable-next-line no-console
  console.log('[QA ROW SEARCH]', await collectHistorialSearchDiagnostics(page, tag, { gastoId: opts?.gastoId, probe }));
  qaTestLog('after expect visible');
}

/** Verifica que el gasto QA exista en historial (BD + búsqueda server + fila visible). */
export async function expectGastoVisibleInHistorial(
  page: Page,
  tag: string,
  opts?: { gastoId?: string },
): Promise<void> {
  qaTestLog('before expect visible');

  if (opts?.gastoId && qaDbWritesEnabled()) {
    const db = await verifyQaGastoInSupabase(opts.gastoId, tag);
    if (!db.exists) {
      throw new Error(`Gasto QA id=${opts.gastoId} no existe en Supabase antes de buscar en historial`);
    }
    // eslint-disable-next-line no-console
    console.info('[QA ROW SEARCH] BD OK', { id: db.id, tipo_gasto: db.tipo_gasto, created_at: db.created_at });
  }

  let probe = await probeGastoHistorialRow(page, tag);
  if (probe.found) {
    await finishGastoRowFound(page, tag, probe, opts);
    return;
  }

  await searchGastoHistorial(page, tag, opts);
  probe = await probeGastoHistorialRow(page, tag);
  if (probe.found) {
    await finishGastoRowFound(page, tag, probe, opts);
    return;
  }

  await logQaLocatorProbe(page, tag, probe);
  const { byTable, byRole } = getGastoHistorialRowLocators(page, tag);
  try {
    if (probe.tableCount > 0) {
      await expect(byTable.first()).toBeVisible({ timeout: HISTORIAL_ROW_TIMEOUT_MS });
    } else if (probe.roleCount > 0) {
      await expect(byRole.first()).toBeVisible({ timeout: HISTORIAL_ROW_TIMEOUT_MS });
    } else {
      await expect(byTable.first()).toBeVisible({ timeout: HISTORIAL_ROW_TIMEOUT_MS });
    }
    probe = await probeGastoHistorialRow(page, tag);
    await finishGastoRowFound(page, tag, probe, opts);
  } catch {
    probe = await probeGastoHistorialRow(page, tag);
    // eslint-disable-next-line no-console
    console.log('[QA ROW SEARCH]', await collectHistorialSearchDiagnostics(page, tag, { gastoId: opts?.gastoId, probe }));
    throw new Error(await captureQaRowDiagnostics(page, tag, 'expectGastoVisibleInHistorial'));
  }
}

export type GastoHistorialRowAction = 'editar' | 'mover' | 'detalles' | 'eliminar';

const GASTO_ROW_ACTION_TITLE: Record<GastoHistorialRowAction, string> = {
  editar: 'Editar gasto',
  mover: 'Mover categoría',
  detalles: 'Ver detalles',
  eliminar: 'Eliminar',
};

function qaMoveLog(step: string): void {
  // eslint-disable-next-line no-console
  console.log(`[QA MOVE] ${step}`);
}

async function captureMoveModalDidNotOpen(page: Page, row: Locator): Promise<string> {
  const dir = path.join(process.cwd(), 'test-results');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = Date.now();
  const screenshotPath = path.join(dir, `move-modal-failed-${stamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  const rowHtml = await row.innerHTML().catch(() => '(fila no encontrada)');
  const rowHtmlPath = path.join(dir, `move-modal-row-${stamp}.html`);
  fs.writeFileSync(rowHtmlPath, rowHtml, 'utf8');
  const buttons = await row.locator('button').all();
  const rowButtons: string[] = [];
  for (const btn of buttons) {
    const title = await btn.getAttribute('title').catch(() => null);
    const aria = await btn.getAttribute('aria-label').catch(() => null);
    const visible = await btn.isVisible().catch(() => false);
    rowButtons.push(`title=${title ?? '-'} aria=${aria ?? '-'} visible=${visible}`);
  }
  return [
    'Move modal did not open',
    `url=${page.url()}`,
    `screenshot=${screenshotPath}`,
    `rowHtml=${rowHtmlPath}`,
    `rowButtons=${rowButtons.join(' | ') || '(ninguno)'}`,
  ].join('\n');
}

/** Clic en «Mover categoría» (icono con title, no accessible name). */
export async function clickMoverCategoriaEnFila(
  page: Page,
  tag: string,
  opts?: { gastoId?: string; alreadyVisible?: boolean },
): Promise<void> {
  if (!opts?.alreadyVisible) {
    await expectGastoVisibleInHistorial(page, tag, { gastoId: opts?.gastoId });
  }
  const probe = await probeGastoHistorialRow(page, tag);
  if (!probe.found) {
    throw new Error(
      `Fila QA no visible antes de mover categoría (table=${probe.tableCount} role=${probe.roleCount})`,
    );
  }
  const row = probe.activeRow;
  await logQaLocatorProbe(page, tag, probe);

  qaTestLog('before click mover');
  const moverBtn = row.getByTitle('Mover categoría', { exact: true });
  await expect(moverBtn).toBeVisible({ timeout: HISTORIAL_ROW_TIMEOUT_MS });
  await expect(moverBtn).toBeEnabled({ timeout: HISTORIAL_ROW_TIMEOUT_MS });
  await moverBtn.click();
  qaTestLog('after click mover');

  const modal = page.getByRole('dialog', { name: /Mover gasto de categoría/i });
  try {
    await expect(modal).toBeVisible({ timeout: 15_000 });
  } catch {
    throw new Error(await captureMoveModalDidNotOpen(page, row));
  }
  qaMoveLog('modal visible');
}

export function getMoveCategoriaModal(page: Page) {
  return page.getByRole('dialog', { name: /Mover gasto de categoría/i });
}

/** Completa modal mover categoría: destino, subtipo si aplica, confirmar y esperar PATCH. */
export async function confirmMoveGastoToCategoria(
  page: Page,
  destinoValue: string,
  opts?: { subtipoValue?: string },
): Promise<void> {
  const modal = getMoveCategoriaModal(page);
  await expect(modal).toBeVisible({ timeout: 15_000 });

  const categoriaSelect = modal.getByLabel('Nueva categoría');
  await expect(categoriaSelect).toBeVisible({ timeout: 15_000 });
  await categoriaSelect.selectOption(destinoValue);
  qaMoveLog('category selected');

  const subtipoSelect = modal.getByLabel('Subtipo (opcional)');
  if (await subtipoSelect.isVisible().catch(() => false)) {
    if (opts?.subtipoValue) {
      await subtipoSelect.selectOption(opts.subtipoValue);
    }
    const subtipoVal = await subtipoSelect.inputValue();
    qaMoveLog(`subtipo selected (${subtipoVal || 'default'})`);
  }

  const confirmBtn = modal.getByRole('button', { name: 'Confirmar movimiento', exact: true });
  await expect(confirmBtn).toBeVisible({ timeout: 15_000 });
  try {
    await expect(confirmBtn).toBeEnabled({ timeout: 15_000 });
  } catch {
    const body = (await modal.textContent())?.slice(0, 600) ?? '';
    throw new Error(`Move confirm button disabled. Modal excerpt: ${body}`);
  }

  const patchResponse = page.waitForResponse(
    (resp) =>
      GASTOS_REST_PATH.test(resp.url()) &&
      resp.request().method() === 'PATCH' &&
      resp.status() >= 200 &&
      resp.status() < 300,
    { timeout: 30_000 },
  );

  qaMoveLog('submit clicked');
  await confirmBtn.click();

  try {
    await patchResponse;
    qaMoveLog('backend response OK');
  } catch (err) {
    throw new Error(
      `Move PATCH failed or timed out: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await expect(modal).toBeHidden({ timeout: 15_000 });
}

/** Acción de fila en historial (iconos con title=, no accessible name). */
export async function clickGastoHistorialRowAction(
  page: Page,
  tag: string,
  action: GastoHistorialRowAction,
  opts?: { gastoId?: string; skipSearch?: boolean },
): Promise<void> {
  if (action === 'mover') {
    await clickMoverCategoriaEnFila(page, tag, {
      gastoId: opts?.gastoId,
      alreadyVisible: opts?.skipSearch,
    });
    return;
  }

  if (!opts?.skipSearch) {
    await expectGastoVisibleInHistorial(page, tag, { gastoId: opts?.gastoId });
  }
  const probe = await probeGastoHistorialRow(page, tag);
  const row = probe.found ? probe.activeRow : getGastoHistorialRow(page, tag, opts);
  await logQaLocatorProbe(page, tag, probe);
  const btn = row.getByTitle(GASTO_ROW_ACTION_TITLE[action], { exact: true });
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.click();
}

/** Abre edición del gasto QA (icono en fila → modal «Editar registro»). */
export async function openGastoEditFromHistorial(
  page: Page,
  tag: string,
  opts?: { gastoId?: string },
): Promise<void> {
  await clickGastoHistorialRowAction(page, tag, 'editar', opts);
  await page.locator('#gasto-edit-comentarios').waitFor({ state: 'visible', timeout: 20_000 });
}

export function getGastoEditDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Editar registro' });
}

export async function saveGastoEditDialog(page: Page): Promise<void> {
  const dialog = getGastoEditDialog(page);
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 60_000 });
}

export async function enterGastosCategoriaTab(page: Page, tabLabel: string): Promise<void> {
  const gastosPath = '/finanzas/gastos';
  if (!page.url().includes(gastosPath)) {
    await page.goto(gastosPath);
    await page.waitForLoadState('domcontentloaded');
  } else {
    await waitForGastosPageReady(page).catch(() => undefined);
  }

  const cambiarCategoria = page.getByRole('button', { name: '← Cambiar categoría' });
  if (await cambiarCategoria.isVisible().catch(() => false)) {
    await cambiarCategoria.click();
    await waitForGastosPageReady(page);
  }

  const tab = page.getByRole('tab', { name: new RegExp(`Entrar a ${tabLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') });
  await tab.waitFor({ state: 'visible', timeout: 60_000 });
  await tab.click();
  await waitForHistorialUiReady(page);
}

function isSuccessfulGastoDeleteResponse(resp: {
  url(): string;
  request(): { method(): string };
  status(): number;
}): boolean {
  return (
    GASTOS_REST_PATH.test(resp.url()) &&
    resp.request().method() === 'DELETE' &&
    resp.status() >= 200 &&
    resp.status() < 300
  );
}

function isSuccessfulGastoPatchResponse(resp: {
  url(): string;
  request(): { method(): string };
  status(): number;
}): boolean {
  return (
    GASTOS_REST_PATH.test(resp.url()) &&
    resp.request().method() === 'PATCH' &&
    resp.status() >= 200 &&
    resp.status() < 300
  );
}

/** Botón global «Deshacer» del header (última acción registrada). */
export function getUndoHeaderButton(page: Page): Locator {
  return page.getByRole('button', { name: /Revertir última acción/i });
}

/** Clic en Deshacer (toast reciente o botón global del header). */
export async function clickUndo(page: Page): Promise<void> {
  qaTestLog('before click undo');
  const toastUndo = page.getByRole('button', { name: 'Deshacer', exact: true });
  if (await toastUndo.isVisible().catch(() => false)) {
    await toastUndo.click();
  } else {
    const candidates = getUndoHeaderButton(page);
    const count = await candidates.count();
    let btn = candidates.first();
    for (let i = 0; i < count; i++) {
      const candidate = candidates.nth(i);
      if (await candidate.isVisible().catch(() => false)) {
        btn = candidate;
        break;
      }
    }
    await expect(btn).toBeEnabled({ timeout: 15_000 });
    await btn.click();
  }
  await page
    .getByText(/Cambio revertido/i)
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 });
  qaTestLog('after click undo');
}

/** Verifica que el gasto QA no aparezca en historial (tras búsqueda server). */
export async function expectGastoNotVisibleInHistorial(
  page: Page,
  tag: string,
  opts?: { gastoId?: string },
): Promise<void> {
  qaTestLog('before expect not visible');
  await searchGastoHistorial(page, tag, opts);
  const probe = await probeGastoHistorialRow(page, tag);
  if (probe.found) {
    throw new Error(
      `Gasto QA "${tag}" sigue visible en historial (table=${probe.tableCount} role=${probe.roleCount})`,
    );
  }
  const { byTable } = getGastoHistorialRowLocators(page, tag);
  await expect(byTable).toHaveCount(0, { timeout: 10_000 });
  qaTestLog('after expect not visible');
}

/** Abre edición desde la fila QA exacta (icono Editar). */
export async function clickEditarGastoEnFila(
  page: Page,
  tag: string,
  opts?: { gastoId?: string; alreadyVisible?: boolean },
): Promise<void> {
  if (!opts?.alreadyVisible) {
    await expectGastoVisibleInHistorial(page, tag, { gastoId: opts?.gastoId });
  }
  await clickGastoHistorialRowAction(page, tag, 'editar', {
    gastoId: opts?.gastoId,
    skipSearch: opts?.alreadyVisible,
  });
  await page.locator('#gasto-edit-comentarios').waitFor({ state: 'visible', timeout: 15_000 });
}

/** Guarda modal «Editar registro» y espera PATCH exitoso. */
export async function saveEditarGastoModal(page: Page): Promise<void> {
  const dialog = getGastoEditDialog(page);
  const patchResponse = page.waitForResponse(isSuccessfulGastoPatchResponse, { timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  try {
    await patchResponse;
  } catch (err) {
    throw new Error(
      `Edit PATCH failed or timed out: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  await dialog.waitFor({ state: 'hidden', timeout: 30_000 });
  qaTestLog('edit saved');
}

/** Clic en Eliminar en la fila QA exacta. */
export async function clickEliminarGastoEnFila(
  page: Page,
  tag: string,
  opts?: { gastoId?: string; alreadyVisible?: boolean },
): Promise<void> {
  if (!opts?.alreadyVisible) {
    await expectGastoVisibleInHistorial(page, tag, { gastoId: opts?.gastoId });
  }
  await clickGastoHistorialRowAction(page, tag, 'eliminar', {
    gastoId: opts?.gastoId,
    skipSearch: opts?.alreadyVisible,
  });
}

/** Confirma modal «Confirmar eliminación» y espera DELETE exitoso. */
export async function confirmDeleteGasto(page: Page): Promise<void> {
  const modal = page.getByRole('dialog', { name: 'Confirmar eliminación' });
  await expect(modal).toBeVisible({ timeout: 10_000 });
  const deleteResponse = page.waitForResponse(isSuccessfulGastoDeleteResponse, { timeout: 30_000 });
  await modal.getByRole('button', { name: 'Eliminar', exact: true }).click();
  try {
    await deleteResponse;
  } catch (err) {
    throw new Error(
      `Delete failed or timed out: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  await expect(modal).toBeHidden({ timeout: 15_000 });
  qaTestLog('delete confirmed');
}
