const React = require('react')
const { Text, Static, Box } = require('ink')
const path = require('path')
const fs = require('fs')
const Promise = require('bluebird')
const Spinner = require('ink-spinner').default
const download = require('./util/download')
const { performance } = require('perf_hooks')
const obtain = require('./util/obtain')
const getLastPage = require('./util/getLastPage')
const loadExistingEmojis = require('./util/loadExistingEmojis')

const App = ({
  dest = 'emojis',
  limit = null,
  category: categoryName = null,
}) => {
  const [totalEmojis, setTotalEmojis] = React.useState(0)
  const [downloads, setDownloads] = React.useState([])
  const [elapsedTime, setElapsedTime] = React.useState(0)
  const [fetched, setFetched] = React.useState(false)
  const [lastPage, setLastPage] = React.useState(0)

  const formEmojiName = (emojiName, count) => {
    const parsedPath = path.parse(emojiName)

    return count === 0
      ? emojiName
      : `${parsedPath.name}-${count}${[parsedPath.ext]}`
  }

  React.useEffect(() => {
    const outputDir =
      dest === 'emojis' ? `${process.cwd()}/emojis` : `${dest}/emojis`
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })

    getLastPage().then((lastPage) => {
      setLastPage(lastPage)
      obtain(limit, lastPage).then((results) => {
        let downloadList = prepare(results, categoryName, outputDir)

        const existingEmojis = loadExistingEmojis(outputDir)

        if (existingEmojis) {
          downloadList = downloadList.filter(
            (emoji) => !existingEmojis.includes(emoji.name)
          )
        }

        setTotalEmojis(downloadList.length)
        setFetched(true)

        let t0 = performance.now()
        Promise.map(
          downloadList,
          (emoji) => {
            if (!fs.existsSync(emoji.dest)) fs.mkdirSync(emoji.dest)

            let dupeCount = 0
            while (
              fs.existsSync(
                path.join(emoji.dest, formEmojiName(emoji.name, dupeCount))
              )
            ) {
              dupeCount += 1
            }

            return download(
              emoji.url,
              path.join(emoji.dest, formEmojiName(emoji.name, dupeCount))
            ).then(() => {
              setDownloads((previousDownloads) => [
                ...previousDownloads,
                {
                  id: previousDownloads.length,
                  title: `Downloaded ${emoji.dest}/${emoji.name}`,
                },
              ])
              setElapsedTime((performance.now() - t0) / 1000)
            })
          },
          { concurrency: 20 }
        )
      })
    })
  }, [])

  if (lastPage == 0) {
    return (
      <>
        <Text>
          <Text color="green">
            <Spinner type="dots" />
          </Text>
          {' Determining Last Page Of Emojis'}
        </Text>
      </>
    )
  }

  if (totalEmojis === 0 && !fetched) {
    return (
      <>
        <Text>
          <Text color="green">
            <Spinner type="dots" />
          </Text>
          {` Requesting Emoji Listing For ${limit ? limit : lastPage} Pages`}
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
