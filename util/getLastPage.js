const fs = require('fs')
const os = require('os')
const path = require('path')
const getPage = require('./getPage')

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const FALLBACK_CACHE_DIR = path.join(os.tmpdir(), 'slackmojis-dl')

const baseCacheDir = (() => {
  try {
    const home = os.homedir()
    if (!home) {
      throw new Error('Missing home directory')
    }
    const xdgCache = process.env.XDG_CACHE_HOME
    return path.join(xdgCache || path.join(home, '.cache'), 'slackmojis-dl')
  } catch {
    return FALLBACK_CACHE_DIR
  }
})()

const CACHE_FILE = path.join(baseCacheDir, 'last-page.json')

const readCachedLastPage = () => {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8')
    const payload = JSON.parse(raw)
    if (
      typeof payload?.page === 'number' &&
      typeof payload?.timestamp === 'number'
    ) {
      const age = Date.now() - payload.timestamp
      if (age <= CACHE_TTL_MS) {
        return payload.page
      }
    }
  } catch {
    // Ignore cache read failures
  }

  return null
}

const writeCachedLastPage = (page) => {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true })
    const payload = JSON.stringify({ page, timestamp: Date.now() })
    fs.writeFileSync(CACHE_FILE, payload)
  } catch {
    // Cache writes are best-effort
  }
}

const safeGetPage = async (pageNumber) => {
  const results = await getPage(pageNumber)
  return Array.isArray(results) ? results : []
}

const validateCachedPage = async (page) => {
  if (!Number.isFinite(page) || page < 0) {
    return null
  }

  const current = await safeGetPage(page)
  if (current.length === 0) {
    return null
  }

  const next = await safeGetPage(page + 1)
  if (next.length === 0) {
    return { type: 'fresh', page }
  }

  return { type: 'stale', nextKnownPage: page + 1 }
}

const ensureBaseline = async () => {
  const firstPage = await safeGetPage(0)

  if (firstPage.length === 0) {
    throw new Error('Emoji listing appears to be empty.')
  }
}

const findLastPage = async (knownPageWithData) => {
  const startPage = Math.max(0, Math.floor(knownPageWithData))
  let lowerBound = startPage
  let upperBound = lowerBound + 1
  let probeResults = await safeGetPage(upperBound)

  while (probeResults.length > 0) {
    lowerBound = upperBound
    upperBound *= 2
    probeResults = await safeGetPage(upperBound)
  }

  while (lowerBound + 1 < upperBound) {
    const midpoint = Math.floor((lowerBound + upperBound) / 2)
    const midResults = await safeGetPage(midpoint)

    if (midResults.length > 0) {
      lowerBound = midpoint
    } else {
      upperBound = midpoint
    }
  }

  return lowerBound
}

const getLastPage = async () => {
  try {
    const cachedPage = readCachedLastPage()
    if (cachedPage !== null) {
      const validation = await validateCachedPage(cachedPage)
      if (validation?.type === 'fresh') {
        writeCachedLastPage(validation.page)
        return validation.page
      }

      if (validation?.type === 'stale') {
        const lastPage = await findLastPage(validation.nextKnownPage)
        writeCachedLastPage(lastPage)
        return lastPage
      }
    }

    await ensureBaseline()
    const lastPage = await findLastPage(0)
    writeCachedLastPage(lastPage)
    return lastPage
  } catch (error) {
    const wrappedError = new Error('Unable to determine last emoji page.')
    wrappedError.cause = error
    throw wrappedError
  }
}

module.exports = getLastPage
