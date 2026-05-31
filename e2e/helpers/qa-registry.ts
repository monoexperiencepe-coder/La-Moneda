import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QA_PREFIX, trackQaArtifact } from './qa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const QA_REGISTRY_DIR = path.join(__dirname, '../.qa-artifacts');
export const QA_REGISTRY_FILE = path.join(QA_REGISTRY_DIR, 'registry.json');
export const QA_CLEANUP_REPORT_FILE = path.join(QA_REGISTRY_DIR, 'cleanup-report.json');

export type QaEntityKind = 'gasto' | 'vehiculo' | 'kilometraje' | 'control_fecha';

export type QaCleanupStatus = 'pending' | 'deleted' | 'failed';

export interface QaEntityRecord {
  kind: QaEntityKind;
  id: string;
  label: string;
  testKey: string;
  createdAt: string;
  cleanupStatus: QaCleanupStatus;
  cleanupError?: string;
  cleanupMethod?: 'api' | 'ui' | 'none';
}

export interface QaRegistryFile {
  sessionStartedAt: string;
  entities: QaEntityRecord[];
}

let currentTestKey = 'unknown';

export function setQaCurrentTest(testKey: string): void {
  currentTestKey = testKey;
}

export function getQaCurrentTest(): string {
  return currentTestKey;
}

export function assertQaMarker(text: string, field = 'texto'): void {
  if (!text.includes(QA_PREFIX)) {
    throw new Error(`E2E: ${field} debe incluir el prefijo obligatorio ${QA_PREFIX}. Recibido: "${text}"`);
  }
}

export function assertQaPlaca(placa: string): void {
  if (!/^QA/i.test(placa.trim())) {
    throw new Error(`E2E: placa QA debe empezar con "QA". Recibida: "${placa}"`);
  }
}

function defaultRegistry(): QaRegistryFile {
  return { sessionStartedAt: new Date().toISOString(), entities: [] };
}

export function resetQaRegistry(): void {
  fs.mkdirSync(QA_REGISTRY_DIR, { recursive: true });
  fs.writeFileSync(QA_REGISTRY_FILE, JSON.stringify(defaultRegistry(), null, 2), 'utf8');
}

export function readQaRegistry(): QaRegistryFile {
  if (!fs.existsSync(QA_REGISTRY_FILE)) return defaultRegistry();
  try {
    const raw = JSON.parse(fs.readFileSync(QA_REGISTRY_FILE, 'utf8')) as QaRegistryFile;
    if (!Array.isArray(raw.entities)) return defaultRegistry();
    return raw;
  } catch {
    return defaultRegistry();
  }
}

function writeQaRegistry(data: QaRegistryFile): void {
  fs.mkdirSync(QA_REGISTRY_DIR, { recursive: true });
  fs.writeFileSync(QA_REGISTRY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function registerQaEntity(
  entity: Pick<QaEntityRecord, 'kind' | 'id' | 'label'>,
): QaEntityRecord {
  const reg = readQaRegistry();
  const existing = reg.entities.find((e) => e.kind === entity.kind && e.id === entity.id);
  if (existing) return existing;

  const record: QaEntityRecord = {
    ...entity,
    testKey: currentTestKey,
    createdAt: new Date().toISOString(),
    cleanupStatus: 'pending',
  };
  reg.entities.push(record);
  writeQaRegistry(reg);
  return record;
}

export function registerQaGasto(id: string, tag: string): void {
  assertQaMarker(tag, 'comentarios QA');
  if (!id.trim()) throw new Error('E2E: registerQaGasto requiere id válido');
  registerQaEntity({ kind: 'gasto', id: id.trim(), label: tag });
  trackQaArtifact(`gasto · id=${id} · ${tag}`);
}

export function registerQaKilometraje(id: string | number, tag: string): void {
  assertQaMarker(tag, 'descripcion QA');
  const sid = String(id).trim();
  if (!sid) throw new Error('E2E: registerQaKilometraje requiere id válido');
  registerQaEntity({ kind: 'kilometraje', id: sid, label: tag });
  trackQaArtifact(`kilometraje · id=${sid} · ${tag}`);
}

export function registerQaVehiculo(id: string | number, placa: string, modelo?: string): void {
  assertQaPlaca(placa);
  if (modelo) assertQaMarker(modelo, 'modelo QA');
  const sid = String(id).trim();
  if (!sid) throw new Error('E2E: registerQaVehiculo requiere id válido');
  registerQaEntity({ kind: 'vehiculo', id: sid, label: placa.trim() });
  trackQaArtifact(`vehículo · id=${sid} · placa ${placa}`);
}

export function registerQaControlFecha(id: string | number, tag: string): void {
  assertQaMarker(tag, 'comentarios QA');
  const sid = String(id).trim();
  if (!sid) throw new Error('E2E: registerQaControlFecha requiere id válido');
  registerQaEntity({ kind: 'control_fecha', id: sid, label: tag });
  trackQaArtifact(`control_fecha · id=${sid} · ${tag}`);
}

export function updateQaEntityStatus(
  kind: QaEntityKind,
  id: string,
  patch: Pick<QaEntityRecord, 'cleanupStatus' | 'cleanupError' | 'cleanupMethod'>,
): void {
  const reg = readQaRegistry();
  const hit = reg.entities.find((e) => e.kind === kind && e.id === id);
  if (!hit) return;
  Object.assign(hit, patch);
  writeQaRegistry(reg);
}

export function getPendingQaEntities(testKey?: string): QaEntityRecord[] {
  const pending = readQaRegistry().entities.filter((e) => e.cleanupStatus === 'pending');
  return testKey ? pending.filter((e) => e.testKey === testKey) : pending;
}

export function getFailedQaEntities(): QaEntityRecord[] {
  return readQaRegistry().entities.filter((e) => e.cleanupStatus === 'failed');
}

/** Marca entidad como ya eliminada (p. ej. undo create o delete en test). Evita fallo en globalTeardown. */
export function markQaEntityCleaned(
  id: string,
  opts?: { kind?: QaEntityKind; method?: QaEntityRecord['cleanupMethod'] },
): void {
  const kind = opts?.kind ?? 'gasto';
  const sid = id.trim();
  if (!sid) throw new Error('E2E: markQaEntityCleaned requiere id válido');
  updateQaEntityStatus(kind, sid, {
    cleanupStatus: 'deleted',
    cleanupMethod: opts?.method ?? 'none',
    cleanupError: undefined,
  });
  trackQaArtifact(`${kind} marcado cleaned · id=${sid}`);
}
