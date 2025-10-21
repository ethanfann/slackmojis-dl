/**
 * Run asynchronous work with a concurrency limit while preserving result order.
 * @param {Array<T>} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} task
 * @returns {Promise<Array<R>>}
 * @template T, R
 */
async function mapWithConcurrency(items, limit, task) {
  if (!Array.isArray(items)) {
    throw new TypeError('items must be an array')
  }

  if (items.length === 0) {
    return []
  }

  const results = new Array(items.length)
  const maxWorkers =
    Number.isFinite(limit) && limit > 0
      ? Math.min(limit, items.length)
      : items.length

  let cursor = 0

  const workers = Array.from({ length: maxWorkers || 1 }, async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) break
      results[index] = await task(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}

module.exports = { mapWithConcurrency }
