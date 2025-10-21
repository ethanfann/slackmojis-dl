const React = require('react')
const { Text, Static, Box } = require('ink')
const path = require('path')
const fs = require('fs')
const Spinner = require('ink-spinner').default
const download = require('./util/download')
const { performance } = require('perf_hooks')
const obtain = require('./util/obtain')
const getLastPage = require('./util/getLastPage')
const loadExistingEmojis = require('./util/loadExistingEmojis')
const prepare = require('./util/prepare')
const { mapWithConcurrency } = require('./util/concurrency')

const DOWNLOAD_CONCURRENCY = 100

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
  const [errors, setErrors] = React.useState([])

  const formEmojiName = (emojiName, count) => {
    const parsedPath = path.parse(emojiName)

    return count === 0
      ? emojiName
      : `${parsedPath.name}-${count}${[parsedPath.ext]}`
  }

  React.useEffect(() => {
    let isMounted = true

    const run = async () => {
      try {
        const outputDir =
          dest === 'emojis' ? `${process.cwd()}/emojis` : `${dest}/emojis`
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true })
        }

        const resolvedLastPage = await getLastPage()
        if (!isMounted) return
        setLastPage(resolvedLastPage)

        const results = await obtain(limit, resolvedLastPage)
        if (!isMounted) return

        let downloadList = prepare(results, categoryName, outputDir)
        const existingEmojis = loadExistingEmojis(outputDir)

        if (existingEmojis) {
          downloadList = downloadList.filter(
            (emoji) =>
              !existingEmojis.includes(path.join(emoji.category, emoji.name))
          )
        }

        if (!isMounted) return
        setTotalEmojis(downloadList.length)
        setFetched(true)

        if (downloadList.length === 0) {
          return
        }

        const startTime = performance.now()

        const updateElapsed = () => {
          if (!isMounted) return
          setElapsedTime(() => (performance.now() - startTime) / 1000)
        }

        const formatErrorMessage = (error) => {
          if (!error) return 'Unknown error'
          const baseMessage = error.message || 'Unknown error'
          const causeMessage = error.cause?.message
          return causeMessage ? `${baseMessage}: ${causeMessage}` : baseMessage
        }

        await mapWithConcurrency(
          downloadList,
          DOWNLOAD_CONCURRENCY,
          async (emoji) => {
            if (!fs.existsSync(emoji.dest)) {
              fs.mkdirSync(emoji.dest, { recursive: true })
            }

            let dupeCount = 0
            while (
              fs.existsSync(
                path.join(emoji.dest, formEmojiName(emoji.name, dupeCount))
              )
            ) {
              dupeCount += 1
            }

            const finalFileName = formEmojiName(emoji.name, dupeCount)
            const destinationPath = path.join(emoji.dest, finalFileName)
            const eventKey = path.join(emoji.category, finalFileName)

            try {
              await download(emoji.url, destinationPath, {
                maxRetries: 2,
              })

              if (!isMounted) return
              setDownloads((previousDownloads) => [
                ...previousDownloads,
                {
                  id: previousDownloads.length,
                  title: `Downloaded ${emoji.dest}/${finalFileName}`,
                },
              ])
            } catch (error) {
              if (!isMounted) return
              const message = formatErrorMessage(error)
              console.error(`Failed to download ${emoji.url}: ${message}`)

              setErrors((previousErrors) => {
                if (previousErrors.some((entry) => entry.key === eventKey)) {
                  return previousErrors
                }

                return [
                  ...previousErrors,
                  {
                    id: previousErrors.length,
                    key: eventKey,
                    title: `Failed ${emoji.dest}/${finalFileName}: ${message}`,
                  },
                ]
              })
            } finally {
              updateElapsed()
            }
          }
        )
      } catch (error) {
        if (!isMounted) return
        const message = formatErrorMessage(error)
        console.error(`Failed to prepare downloads: ${message}`)
        setErrors((previousErrors) => [
          ...previousErrors,
          {
            id: previousErrors.length,
            key: `fatal-${previousErrors.length}`,
            title: `Failed to prepare downloads: ${message}`,
          },
        ])
      }
    }

    run()

    return () => {
      isMounted = false
    }
  }, [])

  const processedEmojis = downloads.length + errors.length
  const elapsedSeconds = elapsedTime
  const formattedElapsed =
    elapsedSeconds > 0 ? elapsedSeconds.toFixed(1) : '0.0'
  const emojisPerSecond =
    elapsedSeconds > 0
      ? Math.round((processedEmojis / elapsedSeconds) * 10) / 10
      : 0

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

      {errors.length > 0 && (
        <Static items={errors}>
          {(failure) => (
            <Box key={failure.id}>
              <Text color="red">✖ {failure.title}</Text>
            </Box>
          )}
        </Static>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          Progress: {processedEmojis} / {totalEmojis} | Successes:{' '}
          {downloads.length} | Errors: {errors.length} | Elapsed:{' '}
          {formattedElapsed}s | {emojisPerSecond} emoji/s
        </Text>
      </Box>
    </>
  )
}

module.exports = App
