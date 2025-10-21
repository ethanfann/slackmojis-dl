const getPage = require('./getPage')
const { mapWithConcurrency } = require('./concurrency')

const DEFAULT_PAGE_CONCURRENCY = 10

const resolvePageCount = (limit, lastPage) => {
  if (lastPage < 0) {
    throw new Error('lastPage must be a non-negative number')
  }

  const totalPages = lastPage + 1
  const parsedLimit = Number(limit)

  if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
    return Math.min(Math.floor(parsedLimit), totalPages)
  }

  return totalPages
}

const getEntireList = async (limit, lastPage) => {
  const pageCount = resolvePageCount(limit, lastPage)
  const pages = Array.from({ length: pageCount }, (_, pageNumber) => pageNumber)

  const pageResults = await mapWithConcurrency(
    pages,
    DEFAULT_PAGE_CONCURRENCY,
    async (page) => {
      const results = await getPage(page)
      return results
    }
  )

  return pageResults.flat()
}

const obtain = async (limit, lastPage) => {
  try {
    const results = await getEntireList(limit, lastPage)
    return results
  } catch (error) {
    const wrappedError = new Error('Unable to obtain Emoji Listing.')
    wrappedError.cause = error
    throw wrappedError
  }
}

module.exports = obtain
