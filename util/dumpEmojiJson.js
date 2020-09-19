const axios = require('axios')
const fs = require('fs')

async function dumpEmojiJson() {
  const writer = fs.createWriteStream('emojis.json')

  return axios({
    method: 'get',
    url: 'https://slackmojis.com/emojis.json',
    responseType: 'stream',
  }).then((response) => {
    return new Promise((resolve, reject) => {
      response.data.pipe(writer)
      let error = null
      writer.on('error', (err) => {
        error = err
        writer.close()
        reject(err)
      })
      writer.on('close', () => {
        if (!error) {
          resolve(true)
        }
      })
    })
  })
}

module.exports = dumpEmojiJson
