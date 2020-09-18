const axios = require('axios')
const download = require('image-downloader')
const fs = require('fs')
const Promise = require('bluebird')

axios.get('https://slackmojis.com/emojis.json').then((response) => {
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
				console.log('File saved to', filename)
			})
			.catch((err) => {
				console.error(err)
			})
	})
})
