const React = require('react')
const { Text, Static, Box } = require('ink')
const download = require('image-downloader')
const fs = require('fs')
const Promise = require('bluebird')
const axios = require('axios')
const Spinner = require('ink-spinner').default

const App = () => {
	const [totalEmojis, setTotalEmojis] = React.useState(0)
	const [downloads, setDownloads] = React.useState([])

	React.useEffect(() => {
		axios.get('https://slackmojis.com/emojis.json').then((response) => {
			setTotalEmojis(response.data.length)

			const downloadList = response.data.map((emoji) => ({
				url: emoji['image_url'],
				dest: `emojis/${emoji['category'].name}`,
			}))

			if (!fs.existsSync('emojis')) fs.mkdirSync('emojis')
			return Promise.mapSeries(downloadList, (emoji) => {
				if (!fs.existsSync(emoji.dest)) fs.mkdirSync(emoji.dest)
				return download
					.image(emoji)
					.then(({ filename }) => {
						setDownloads((previousDownloads) => [
							...previousDownloads,
							{
								id: previousDownloads.length,
								title: `Downloaded ${filename}`,
							},
						])
					})
					.catch((err) => {
						console.error(err)
					})
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
					Completed: {downloads.length} / {totalEmojis}
				</Text>
			</Box>
		</>
	)
}

module.exports = App
