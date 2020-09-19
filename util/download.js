const axios = require('axios')
const fs = require('fs')

async function download(url, path) {
  const writer = fs.createWriteStream(path)

  return axios({
    method: 'get',
    url: url,
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

module.exports = download
