/**
 * PostgREST (Supabase) suele limitar respuestas (~1000 filas) si no se usa .range().
 * Pagina en bloques y concatena, con el mismo orden en cada página.
 */
const PAGE_SIZE = 1000

type PageError = { message: string } | null

export async function fetchAllSupabasePages<T extends Record<string, unknown>>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: PageError }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0, pageIndex = 0; ; from += PAGE_SIZE, pageIndex += 1) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await fetchPage(from, to)
    if (error) {
      console.error('[fetchAllSupabasePages]', `page ${pageIndex} range ${from}-${to}:`, error.message)
      /** No descartar filas ya leídas: un fallo en página 2+ dejaba el estado local en [] y la UI “vacía”. */
      if (out.length > 0 && import.meta.env.DEV) {
        console.warn('[fetchAllSupabasePages] se conservan', out.length, 'filas obtenidas antes del error')
      }
      return out
    }
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return out
}
