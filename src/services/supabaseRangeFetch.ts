/**
 * PostgREST (Supabase) suele limitar respuestas (~1000 filas) si no se usa .range().
 * Pagina en bloques y concatena, con el mismo orden en cada página.
 */
const PAGE_SIZE = 1000

type PageError = { message: string } | null

export type FetchAllSupabasePagesOptions = {
  /** Etiqueta para logs DEV (p. ej. fetchGastos). */
  label?: string
  /** Prefijo de log adicional (p. ej. [historialFull:gastos]). */
  devLogPrefix?: string
  /** Cancelación cooperativa entre páginas. */
  signal?: AbortSignal
  /** Si true, lanza en lugar de devolver filas parciales ante error de página. */
  throwOnError?: boolean
}

export type FetchAllSupabasePagesResult<T> = {
  rows: T[]
  error: string | null
  pagesFetched: number
}

export async function fetchAllSupabasePages<T extends Record<string, unknown>>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: PageError }>,
  options?: FetchAllSupabasePagesOptions,
): Promise<T[]> {
  const result = await fetchAllSupabasePagesDetailed(fetchPage, options)
  return result.rows
}

export async function fetchAllSupabasePagesDetailed<T extends Record<string, unknown>>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: PageError }>,
  options?: FetchAllSupabasePagesOptions,
): Promise<FetchAllSupabasePagesResult<T>> {
  const dev = import.meta.env.DEV
  const tag = options?.label ?? 'fetchAllSupabasePages'
  const logPrefix = options?.devLogPrefix
  const pageSize = PAGE_SIZE
  const t0 = dev ? performance.now() : 0
  const out: T[] = []
  let pageIndex = 0
  let pagesFetched = 0
  let lastError: string | null = null

  for (let from = 0; ; from += pageSize, pageIndex += 1) {
    if (options?.signal?.aborted) {
      lastError = 'Cancelado'
      break
    }

    const to = from + pageSize - 1
    const pageT0 = dev ? performance.now() : 0
    const { data, error } = await fetchPage(from, to)
    const pageRows = data?.length ?? 0
    pagesFetched += 1

    if (dev) {
      const pageMeta = {
        pageSize,
        page: pageIndex,
        from,
        to,
        rows: pageRows,
        cumulativeRows: out.length + pageRows,
        ms: Math.round(performance.now() - pageT0),
      }
      console.debug(`[perf] ${tag} page`, pageMeta)
      if (logPrefix) {
        console.info(`${logPrefix} page`, pageMeta)
      }
    }

    if (error) {
      lastError = error.message
      console.error(`[perf] ${tag}`, `page ${pageIndex} range ${from}-${to}:`, error.message)
      if (out.length > 0 && dev) {
        console.warn(`[perf] ${tag} partial`, { rowsBeforeError: out.length })
      }
      if (options?.throwOnError) {
        throw new Error(error.message)
      }
      break
    }

    if (pageRows === 0) break

    out.push(...(data as T[]))
    if (pageRows < pageSize) break
  }

  if (dev) {
    const doneMeta = {
      pages: pagesFetched,
      totalRows: out.length,
      ms: Math.round(performance.now() - t0),
      error: lastError,
    }
    console.info(`[perf] ${tag} pages done`, doneMeta)
    if (logPrefix) {
      console.info(`${logPrefix} done`, doneMeta)
    }
  }

  return { rows: out, error: lastError, pagesFetched }
}
