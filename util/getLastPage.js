const getPage = require('./getPage')

const lastPageProbe = async function () {
  /* 
    Slackmojis reached 100 total pages as of Febuary 7, 2022.
    Until a last page attribute is implemented, this will have to do.
    
  */
  let currPage = 100
  let results = await getPage(currPage)

  while (results.length !== 0) {
    currPage += 1
    results = await getPage(currPage)
  }

  return currPage - 1
}

const getLastPage = () => {
  return new Promise((resolve, reject) => {
    try {
      const lastPage = lastPageProbe()
      resolve(lastPage)
    } catch {
      reject(new Error('Unable to determine last emoji page.'))
    }
  })
}

module.exports = getLastPage
