export const KML_DETAIL_LOAD_CONCURRENCY = 4

export async function loadKmlFilesWithConcurrency (
  files,
  loader,
  limit = KML_DETAIL_LOAD_CONCURRENCY,
) {
  if (!(loader instanceof Function)) throw new TypeError('KML 详情加载器无效')

  const items = Array.isArray(files) ? files.filter(Boolean) : []
  if (!items.length) return []

  const concurrency = Math.max(1, Math.floor(Number(limit) || 1))
  const results = new Array(items.length)
  let nextIndex = 0
  const workerCount = Math.min(concurrency, items.length)

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await loader(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}
