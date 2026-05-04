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
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await fetchPage(from, to)
    if (error) {
      console.error('[fetchAllSupabasePages]', error.message)
      return []
    }
    if (!data?.length) break
    out.push(...data)
    if (data.length < PAGE_SIZE) break
  }
  return out
}
