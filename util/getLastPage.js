const getPage = require('./getPage')

// This allows us to simulate an API response for testing purposes.
// Returns an array filled with values based on following cases
// 1. Is the page the last page? Return an incomplete array
// 2. Is the page > the known last page? Return an empty array.
// 3. Is the page < the known last page? Return a completely filled array
const getMockPage = function (page, targetPage) {
  if (page === targetPage) {
    return [...Array(400).keys()]
  } else if (page < targetPage) {
    return [...Array(500).keys()]
  } else {
    return []
  }
}

/*
  -   As of 9/7/2021, the Slackmojis API does not include a pagination header in their response.
  -   Starting at 0 and iterating page by page to retrieve the listing is slow.
  -   To make this faster, we instead find the last page and then use Promise.map to concurrently
      request pages of emojis.

  1.  Start at 0, increment by 50 until we have a page that does not contain 500 values.
      Keep track of the previous (prev) and current (curr) index values
  2.  Start at prev, and increment forward following the floor((prev - curr) / 2) step size 
      formula until we have no results.
  3.  Increment in reverse until results exist and are less than 500
*/
const lastPageProbe = async function (mock = false, targetPage = 50) {
  let prev = 0
  let curr = 0
  let results = mock ? getMockPage(0, targetPage) : await getPage(0)

  // 1
  while (results.length == 500) {
    prev = curr === 0 ? 0 : curr
    curr += 50

    results = mock ? getMockPage(curr, targetPage) : await getPage(curr)
  }

  // 2
  results = mock ? getMockPage(prev, targetPage) : await getPage(prev)
  while (results.length !== 0) {
    let step = Math.floor((curr - prev) / 2)
    prev = prev + step

    results = mock ? getMockPage(prev, targetPage) : await getPage(prev)
    if (results.length > 0 && results.length < 500) {
      return prev
    }
  }

  // 3
  while (results.length === 0) {
    prev -= 1
    results = mock ? getMockPage(prev, targetPage) : await getPage(prev)
  }

  return prev
}

const getLastPage = (mock = false, targetPage = 50) => {
  return new Promise((resolve, reject) => {
    try {
      const lastPage = lastPageProbe(mock, targetPage)
      resolve(lastPage)
    } catch {
      reject(new Error('Unable to determine last emoji page.'))
    }
  })
}

module.exports = getLastPage
