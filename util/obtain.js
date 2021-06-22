const axios = require('axios')
const fs = require('fs')

const getPage = async function (page) {
  let results = await axios({
    method: 'get',
    url: `https://slackmojis.com/emojis.json?page=${String(page)}`,
  }).then((response) => {
    return response.data
  })

  return results
}

const getEntireList = async function () {
  let all = []
  let page = 0

  console.log('Getting data for page: ' + page)
  let results = await getPage(page)
  while (results.length > 0) {
    page = page + 1
    console.log('Getting data for page: ' + page)
    results = await getPage(page)
    all = all.concat(results)
  }

  return all
}

module.exports = getEntireList
