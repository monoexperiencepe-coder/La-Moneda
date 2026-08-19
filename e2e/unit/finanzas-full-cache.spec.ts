import { expect, test } from '@playwright/test';
import {
  FullDatasetSessionCache,
  type FullDatasetSnapshot,
} from '../../src/utils/fullDatasetSessionCache';
import { shouldRefetchAfterRealtime } from '../../src/utils/realtimeRefetchPolicy';

type Row = { id: string; amount: number };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function cacheHarness() {
  let rows: Row[] = [];
  let snapshot: FullDatasetSnapshot = { status: 'not_loaded', loadedAt: null, error: null };
  const cache = new FullDatasetSessionCache<Row>({
    getId: (row) => row.id,
    getCurrentRows: () => rows,
    sortRows: (next) => [...next].sort((a, b) => a.id.localeCompare(b.id)),
    onSnapshot: (next) => { snapshot = next; },
    onReady: (next) => { rows = next; },
  });
  return { cache, getRows: () => rows, getSnapshot: () => snapshot };
}

test('deduplica llamadas simultáneas y reutiliza el histórico ready', async () => {
  const h = cacheHarness();
  const request = deferred<Row[]>();
  let fetches = 0;
  const fetcher = () => {
    fetches += 1;
    return request.promise;
  };

  const first = h.cache.ensure(fetcher);
  const second = h.cache.ensure(fetcher);
  expect(first).toBe(second);
  expect(fetches).toBe(1);
  expect(h.getSnapshot().status).toBe('loading');

  request.resolve([{ id: '1', amount: 10 }]);
  await Promise.all([first, second]);
  expect(h.getSnapshot().status).toBe('ready');

  await h.cache.ensure(fetcher);
  expect(fetches).toBe(1);
});

test('reproduce INSERT, UPDATE y DELETE recibidos durante el snapshot', async () => {
  const h = cacheHarness();
  const request = deferred<Row[]>();
  const loading = h.cache.ensure(() => request.promise);

  h.cache.record({ kind: 'upsert', row: { id: '2', amount: 20 } });
  h.cache.record({ kind: 'upsert', row: { id: '1', amount: 15 } });
  h.cache.record({ kind: 'delete', id: '3' });
  h.cache.record({ kind: 'upsert', row: { id: '2', amount: 25 } });
  request.resolve([
    { id: '1', amount: 10 },
    { id: '3', amount: 30 },
  ]);

  await loading;
  expect(h.getRows()).toEqual([
    { id: '1', amount: 15 },
    { id: '2', amount: 25 },
  ]);
});

test('un fallo no bloquea la sesión y permite retry local', async () => {
  const h = cacheHarness();
  await expect(h.cache.ensure(async () => { throw new Error('network'); })).rejects.toThrow('network');
  expect(h.getSnapshot()).toMatchObject({ status: 'error', error: 'network' });

  await h.cache.ensure(async () => [{ id: '1', amount: 10 }]);
  expect(h.getSnapshot().status).toBe('ready');
  expect(h.getRows()).toHaveLength(1);
});

test('una respuesta de otro tenant invalidada no sobrescribe la sesión nueva', async () => {
  const h = cacheHarness();
  const oldRequest = deferred<Row[]>();
  const oldLoad = h.cache.ensure(() => oldRequest.promise);
  h.cache.clear();
  oldRequest.resolve([{ id: 'old', amount: 999 }]);
  await oldLoad;
  expect(h.getRows()).toEqual([]);
  expect(h.getSnapshot().status).toBe('not_loaded');
});

test('Realtime normal de gastos e ingresos no solicita reconciliación completa', () => {
  expect(shouldRefetchAfterRealtime('gastos')).toBe(false);
  expect(shouldRefetchAfterRealtime('ingresos')).toBe(false);
  expect(shouldRefetchAfterRealtime('kilometrajes')).toBe(true);
});
