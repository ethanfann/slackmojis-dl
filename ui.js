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

  const extractEmojiName = (emoji_url) => {
    const pathname = url.parse(emoji_url).pathname
    const basename = path.basename(pathname)

    return decodeURIComponent(basename)
  }

  React.useEffect(() => {
    axios.get('https://slackmojis.com/emojis.json').then((response) => {
      setTotalEmojis(response.data.length)

      let downloadList = response.data.map((emoji) => ({
        url: emoji['image_url'],
        dest: `${__dirname}/emojis/${emoji['category'].name}`,
        name: extractEmojiName(emoji['image_url']),
      }))

      if (limit) {
        downloadList = downloadList.slice(0, limit)
      }

      let t0 = performance.now()

      if (!fs.existsSync('emojis')) fs.mkdirSync('emojis')
      Promise.mapSeries(downloadList, (emoji) => {
        if (!fs.existsSync(emoji.dest)) fs.mkdirSync(emoji.dest)
        return download(emoji.url, path.join(emoji.dest, emoji.name)).then(
          () => {
            setDownloads((previousDownloads) => [
              ...previousDownloads,
              {
                id: previousDownloads.length,
                title: `Downloaded ${emoji.name}`,
              },
            ])
            setElapsedTime((performance.now() - t0) / 1000)
          }
        )
      })
    })
  }, [])

  if (totalEmojis === 0) {
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
