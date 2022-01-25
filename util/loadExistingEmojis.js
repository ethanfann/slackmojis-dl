const glob = require('glob')

const loadExistingEmojis = (outputDir) => {
  const options = {
    cwd: outputDir,
  }
  const files = glob.sync(`**/*.*`, options)
  return files
}

module.exports = loadExistingEmojis
