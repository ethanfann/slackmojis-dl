const getPage = require('./getPage')
const Promise = require('bluebird')

const getEntireList = async function (limit, lastPage) {
  let all = []

  await Promise.map(
    Array(limit ? limit : lastPage).keys(),
    (page) => {
      return getPage(page).then((results) => {
        all.push(...results)
      })
    },
    { concurrency: 10 }
  )

  return all
}

const obtain = (limit, lastPage) => {
  return new Promise((resolve, reject) => {
    try {
      getEntireList(limit, lastPage).then((results) => {
        resolve(results)
      })
    } catch {
      reject(new Error('Unable to obtain Emoji Listing.'))
    }
  })
}

module.exports = obtain
