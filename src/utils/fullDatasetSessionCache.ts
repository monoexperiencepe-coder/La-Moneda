export type FullDatasetStatus = 'not_loaded' | 'loading' | 'ready' | 'stale' | 'error';

export type FullDatasetSnapshot = {
  status: FullDatasetStatus;
  loadedAt: number | null;
  error: string | null;
};

export type FullDatasetMutation<T> =
  | { kind: 'upsert'; row: T }
  | { kind: 'delete'; id: string };

type Options<T> = {
  getId: (row: T) => string;
  getCurrentRows: () => T[];
  sortRows: (rows: T[]) => T[];
  onSnapshot: (snapshot: FullDatasetSnapshot) => void;
  onReady: (rows: T[]) => void;
};

export function applyFullDatasetMutations<T>(
  snapshot: readonly T[],
  mutations: readonly FullDatasetMutation<T>[],
  getId: (row: T) => string,
  sortRows: (rows: T[]) => T[],
): T[] {
  const rows = new Map(snapshot.map((row) => [getId(row), row]));
  for (const mutation of mutations) {
    if (mutation.kind === 'delete') rows.delete(mutation.id);
    else rows.set(getId(mutation.row), mutation.row);
  }
  return sortRows([...rows.values()]);
}

/**
 * Caché en memoria de una sesión. Deduplica el fetch completo y conserva las
 * mutaciones que llegan mientras se descarga el snapshot para no perder eventos.
 */
export class FullDatasetSessionCache<T> {
  private snapshot: FullDatasetSnapshot = {
    status: 'not_loaded',
    loadedAt: null,
    error: null,
  };

  private inFlight: Promise<T[]> | null = null;
  private mutationsDuringLoad: FullDatasetMutation<T>[] = [];
  private generation = 0;

  constructor(private readonly options: Options<T>) {}

  getSnapshot(): FullDatasetSnapshot {
    return this.snapshot;
  }

  record(mutation: FullDatasetMutation<T>): void {
    if (this.snapshot.status === 'loading') this.mutationsDuringLoad.push(mutation);
  }

  markStale(): void {
    if (this.snapshot.status === 'loading') return;
    this.publish({ ...this.snapshot, status: 'stale', error: null });
  }

  clear(): void {
    this.generation += 1;
    this.inFlight = null;
    this.mutationsDuringLoad = [];
    this.publish({ status: 'not_loaded', loadedAt: null, error: null });
  }

  ensure(fetchSnapshot: () => Promise<T[]>, options?: { force?: boolean }): Promise<T[]> {
    if (this.inFlight) return this.inFlight;
    if (!options?.force && this.snapshot.status === 'ready') {
      return Promise.resolve(this.options.getCurrentRows());
    }

    const generation = ++this.generation;
    this.mutationsDuringLoad = [];
    this.publish({ ...this.snapshot, status: 'loading', error: null });

    const request = fetchSnapshot()
      .then((rows) => {
        if (generation !== this.generation) return this.options.getCurrentRows();
        const merged = applyFullDatasetMutations(
          rows,
          this.mutationsDuringLoad,
          this.options.getId,
          this.options.sortRows,
        );
        this.options.onReady(merged);
        this.publish({ status: 'ready', loadedAt: Date.now(), error: null });
        return merged;
      })
      .catch((error: unknown) => {
        if (generation === this.generation) {
          this.publish({
            ...this.snapshot,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
        throw error;
      })
      .finally(() => {
        if (generation === this.generation) {
          this.inFlight = null;
          this.mutationsDuringLoad = [];
        }
      });

    this.inFlight = request;
    return request;
  }

  private publish(snapshot: FullDatasetSnapshot): void {
    this.snapshot = snapshot;
    this.options.onSnapshot(snapshot);
  }
}
