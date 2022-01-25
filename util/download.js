const createWriteStream = require('fs').createWriteStream
const SharedAxios = require('./sharedAxios')

const download = async (url, path) => {
  const writeOpts = { highWaterMark: Math.pow(2, 16) } // 65536
  const writer = createWriteStream(path, writeOpts)
  const sharedAxios = await SharedAxios()
  return sharedAxios
    .get(`${url.replace('https://emojis.slackmojis.com', '')}`)
    .then((response) => {
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

module.exports = download
