const React = require('react')
const { Text, Static, Box } = require('ink')
const url = require('url')
const path = require('path')
const fs = require('fs')
const axios = require('axios')
const Promise = require('bluebird')
const Spinner = require('ink-spinner').default
const download = require('./util/download')
const { performance } = require('perf_hooks')

const App = ({ limit = null }) => {
  const [totalEmojis, setTotalEmojis] = React.useState(0)
  const [downloads, setDownloads] = React.useState([])
  const [elapsedTime, setElapsedTime] = React.useState(0)
  const [fetched, setFetched] = React.useState(false)

  const extractEmojiName = (emoji_url) => {
    const pathname = url.parse(emoji_url).pathname
    const basename = path.basename(pathname)

    return decodeURIComponent(basename)
  }

  const loadExistingEmojis = () => {
    const folders = fs.readdirSync('emojis')

    let existingEmojis = []
    for (const folder of folders) {
      const found = fs.readdirSync(`emojis/${folder}`)
      existingEmojis.push(...found)
    }

    return existingEmojis
  }

  React.useEffect(() => {
    axios.get('https://slackmojis.com/emojis.json').then((response) => {
      let downloadList = response.data.map((emoji) => ({
        url: emoji['image_url'],
        dest: `${__dirname}/emojis/${emoji['category'].name}`,
        name: extractEmojiName(emoji['image_url']),
      }))

      if (limit) {
        downloadList = downloadList.slice(0, limit)
      }

      const existingEmojis = loadExistingEmojis()

      downloadList = downloadList.filter(
        (emoji) => !existingEmojis.includes(emoji.name)
      )

      setTotalEmojis(downloadList.length)
      setFetched(true)

      let t0 = performance.now()

      if (!fs.existsSync('emojis')) fs.mkdirSync('emojis')
      Promise.map(
        downloadList,
        (emoji) => {
          if (!fs.existsSync(emoji.dest)) fs.mkdirSync(emoji.dest)
          return download(emoji.url, path.join(emoji.dest, emoji.name)).then(
            () => {
              setDownloads((previousDownloads) => [
                ...previousDownloads,
                {
                  id: previousDownloads.length,
                  title: `Downloaded ${emoji.dest}/${emoji.name}`,
                },
              ])
              setElapsedTime((performance.now() - t0) / 1000)
            }
          )
        },
        { concurrency: 10 }
      )
    })
  }, [])

  if (totalEmojis === 0 && !fetched) {
    return (
      <>
        <Text>
          <Text color="green">
            <Spinner type="dots" />
          </Text>
          {' Requesting Emoji Listing'}
        </Text>
      </>
    )
  }

  if (totalEmojis === 0 && fetched) {
    return (
      <>
        <Text color="green">✔ Up to Date</Text>
      </>
    )
  }

  return (
    <>
      <Static items={downloads}>
        {(download) => (
          <Box key={download.id}>
            <Text color="green">✔ {download.title}</Text>
          </Box>
        )}
      </Static>

      <Box marginTop={1}>
        <Text dimColor>
          Progress: {downloads.length} / {totalEmojis} | Elapsed Time:{' '}
          {Math.round(elapsedTime.toFixed(2))}s |{' '}
          {Math.round(downloads.length / elapsedTime)} emoji/s
        </Text>
      </Box>
    </>
  )
}

module.exports = App
