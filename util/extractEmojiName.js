const path = require('path')
const url = require('url')

const extractEmojiName = (emoji_url) => {
  const pathname = url.parse(emoji_url).pathname
  const basename = path.basename(pathname)

  return decodeURIComponent(basename)
}

module.exports = extractEmojiName
