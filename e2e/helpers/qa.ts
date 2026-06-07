/** Prefijo obligatorio en datos creados por E2E (no destructivos, identificables). */
export const QA_PREFIX = '[QA_AUTO]';

export function qaTag(scope: string): string {
  return createQaTag(scope);
}

/** Etiqueta QA estándar: `[QA_AUTO] label timestamp` */
export function createQaTag(label: string): string {
  return `${QA_PREFIX} ${label.trim()} ${Date.now()}`;
}

export function qaPlaca(): string {
  const n = Date.now().toString(36).toUpperCase().slice(-5);
  return `QA${n}`;
}

/** Placa dedicada a tests de kilometraje QA. */
export function qaKmPlaca(): string {
  return `QA-KM-${Date.now()}`;
}

/** Placa dedicada a tests de flota / inventario QA. */
export function qaFlotaPlaca(): string {
  return `QA-FLOTA-${Date.now()}`;
}

/** Tag comentarios documentación QA: [QA_AUTO] doc <scope> <timestamp> */
export function qaDocTag(scope = 'doc'): string {
  return `${QA_PREFIX} doc ${scope} ${Date.now()}`;
}

export function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Tests que escriben en BD requieren QA_ALLOW_DB_WRITES=1 en .env.qa */
export function qaDbWritesEnabled(): boolean {
  return process.env.QA_ALLOW_DB_WRITES?.trim() === '1';
}

export function skipUnlessQaDbWrites(test: { skip: (condition: boolean, description?: string) => void }): void {
  test.skip(
    !qaDbWritesEnabled(),
    'Define QA_ALLOW_DB_WRITES=1 en .env.qa para ejecutar tests que crean data',
  );
}

export function requireQaCredentials(): { email: string; password: string } {
  const email = process.env.QA_USER_EMAIL?.trim() ?? process.env.PLAYWRIGHT_USER_EMAIL?.trim();
  const password = process.env.QA_USER_PASSWORD?.trim() ?? process.env.PLAYWRIGHT_USER_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error(
      'Faltan credenciales QA. Define QA_USER_EMAIL y QA_USER_PASSWORD en .env.qa (copia desde .env.qa.example).',
    );
  }
  return { email, password };
}

/** Bloquea URLs fuera de localhost / staging / dev. */
export function assertNotProduction(): void {
  const url = (process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173').trim().toLowerCase();

  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);
  const isStagingOrDev =
    /\bstaging\b/.test(url) ||
    /\bdev\b/.test(url) ||
    /\.dev\./.test(url) ||
    /-dev\./.test(url);

  if (isLocal || isStagingOrDev) return;

  throw new Error(
    `PLAYWRIGHT_BASE_URL no permitido (${url}). Solo localhost, 127.0.0.1, staging o dev.`,
  );
}

/** Artefactos creados en la sesión (log al final). */
export const qaSessionLog: string[] = [];

export function trackQaArtifact(line: string): void {
  qaSessionLog.push(line);
  // eslint-disable-next-line no-console
  console.info(`[QA_AUTO] ${line}`);
}
