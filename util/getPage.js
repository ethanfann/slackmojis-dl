const axios = require('axios')

const getPage = async function (page) {
  let results = await axios({
    method: 'get',
    url: `https://slackmojis.com/emojis.json?page=${String(page)}`,
  }).then((response) => {
    return response.data
  })

  return results
}

module.exports = getPage
