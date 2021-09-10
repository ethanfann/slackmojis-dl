const extractEmojiName = require('./extractEmojiName')

const prepare = (emojis, category, outputDir) => {
  return emojis
    .filter((emoji) => {
      if (category != null) {
        return emoji['category']['name'] === category
      } else {
        return true
      }
    })
    .map((emoji) => ({
      url: emoji['image_url'],
      dest: `${outputDir}/${emoji['category'].name}`,
      name: extractEmojiName(emoji['image_url']),
    }))
}

module.exports = prepare
