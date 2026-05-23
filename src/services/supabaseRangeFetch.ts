/**
 * PostgREST (Supabase) suele limitar respuestas (~1000 filas) si no se usa .range().
 * Pagina en bloques y concatena, con el mismo orden en cada página.
 */
const PAGE_SIZE = 1000

type PageError = { message: string } | null

export type FetchAllSupabasePagesOptions = {
  /** Etiqueta para logs DEV (p. ej. fetchGastos). */
  label?: string
}

export async function fetchAllSupabasePages<T extends Record<string, unknown>>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: PageError }>,
  options?: FetchAllSupabasePagesOptions,
): Promise<T[]> {
  const dev = import.meta.env.DEV
  const tag = options?.label ?? 'fetchAllSupabasePages'
  const t0 = dev ? performance.now() : 0
  const out: T[] = []
  let pageIndex = 0
  for (let from = 0; ; from += PAGE_SIZE, pageIndex += 1) {
    const to = from + PAGE_SIZE - 1
    const pageT0 = dev ? performance.now() : 0
    const { data, error } = await fetchPage(from, to)
    const pageRows = data?.length ?? 0
    if (dev) {
      console.debug(`[perf] ${tag} page`, {
        page: pageIndex,
        range: `${from}-${to}`,
        rows: pageRows,
        cumulativeRows: out.length + pageRows,
        ms: Math.round(performance.now() - pageT0),
      })
    }
    if (error) {
      console.error(`[perf] ${tag}`, `page ${pageIndex} range ${from}-${to}:`, error.message)
      /** No descartar filas ya leídas: un fallo en página 2+ dejaba el estado local en [] y la UI “vacía”. */
      if (out.length > 0 && dev) {
        console.warn(`[perf] ${tag} partial`, { rowsBeforeError: out.length })
      }
      return out
    }
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  if (dev) {
    console.info(`[perf] ${tag} pages done`, {
      pages: pageIndex + 1,
      totalRows: out.length,
      ms: Math.round(performance.now() - t0),
    })
  }
  return out
}
