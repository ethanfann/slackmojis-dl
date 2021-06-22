const axios = require('axios')
const https = require('https')

let instance
const SharedAxios = async function () {
  if (!instance) {
    instance = await axios.create({
      baseURL: 'https://emojis.slackmojis.com',
      responseType: 'stream',
      httpsAgent: new https.Agent({ keepAlive: true }),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return instance
}

module.exports = SharedAxios
