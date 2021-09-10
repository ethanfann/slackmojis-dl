const fs = require('fs')

const loadExistingEmojis = (outputDir) => {
  if (!fs.existsSync(outputDir)) return

  const folders = fs.readdirSync(outputDir)

  let existingEmojis = []
  for (const folder of folders) {
    const found = fs.readdirSync(`${outputDir}/${folder}`)
    existingEmojis.push(...found)
  }

  return existingEmojis
}

module.exports = loadExistingEmojis
